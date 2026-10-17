import { LocalTime } from "@/components/local-time";
import { formatMoney } from "@/lib/format";

export type BookingRow = {
  id: string;
  starts_at: string;
  type: "trial" | "regular";
  status: string;
  price_cents: number;
  currency: string;
  counterpart: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function BookingList({ bookings, empty }: { bookings: BookingRow[]; empty: React.ReactNode }) {
  if (bookings.length === 0) return <div className="card text-sm text-muted">{empty}</div>;

  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
          <span className="font-medium">{b.counterpart}</span>
          <LocalTime iso={b.starts_at} className="text-muted" />
          {b.type === "trial" && <span className="chip">Trial</span>}
          <span className="ml-auto">{formatMoney(b.price_cents, b.currency)}</span>
          <span className="chip">{STATUS_LABEL[b.status] ?? b.status}</span>
        </li>
      ))}
    </ul>
  );
}
