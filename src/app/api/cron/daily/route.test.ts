import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments", () => ({
  runDailyJobs: vi.fn(async () => ({ completed: 1, refunds: { refunded: 0, failed: 0 }, payouts: { paid: 1, failed: 0 } })),
}));

const { GET } = await import("./route");
const { runDailyJobs } = await import("@/lib/payments");

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/cron/daily", { headers: auth ? { authorization: auth } : {} }));

describe("daily cron", () => {
  it("refuses to run when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(401);
  });

  it("refuses requests without the secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(runDailyJobs).not.toHaveBeenCalled();
  });

  it("runs the jobs with the secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ completed: 1, payouts: { paid: 1 } });
  });
});
