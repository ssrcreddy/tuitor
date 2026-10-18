"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { openStripeDashboard, setUpPayouts, type PayoutActionState } from "./actions";

const ACTIONS = { setUp: setUpPayouts, dashboard: openStripeDashboard };

export function PayoutButton({
  action,
  label,
  variant = "primary",
}: {
  action: keyof typeof ACTIONS;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction] = useActionState<PayoutActionState, FormData>(() => ACTIONS[action](), {});
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton variant={variant}>{label}</SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
