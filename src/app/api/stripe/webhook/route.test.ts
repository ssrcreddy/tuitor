import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments", () => ({
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutExpired: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handleAccountUpdated: vi.fn(),
}));

const SECRET = "whsec_test_secret";
const CONNECT_SECRET = "whsec_test_connect_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;

const { POST } = await import("./route");
const payments = await import("@/lib/payments");

function signedRequest(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const signature = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

const completed = {
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", metadata: { booking_id: "b1" }, payment_status: "paid" } },
};

describe("Stripe webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects requests without a valid signature", async () => {
    const res = await POST(signedRequest(completed, "whsec_wrong"));
    expect(res.status).toBe(400);
    expect(payments.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("passes completed checkouts to the handler", async () => {
    const res = await POST(signedRequest(completed));
    expect(res.status).toBe(200);
    expect(payments.handleCheckoutCompleted).toHaveBeenCalledWith(completed.data.object);
  });

  it("routes expired checkouts, refunds and Connect account updates", async () => {
    for (const type of ["checkout.session.expired", "charge.refunded", "account.updated"]) {
      await POST(signedRequest({ ...completed, type }));
    }
    expect(payments.handleCheckoutExpired).toHaveBeenCalledOnce();
    expect(payments.handleChargeRefunded).toHaveBeenCalledOnce();
    expect(payments.handleAccountUpdated).toHaveBeenCalledOnce();
  });

  it("accepts Connect events signed with the Connect endpoint's secret", async () => {
    const res = await POST(signedRequest({ ...completed, type: "account.updated" }, CONNECT_SECRET));
    expect(res.status).toBe(200);
    expect(payments.handleAccountUpdated).toHaveBeenCalledOnce();
  });

  it("returns 500 so Stripe retries when a handler fails", async () => {
    vi.mocked(payments.handleCheckoutCompleted).mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest(completed));
    expect(res.status).toBe(500);
  });

  it("ignores events it doesn't handle", async () => {
    const res = await POST(signedRequest({ ...completed, type: "customer.created" }));
    expect(res.status).toBe(200);
  });
});
