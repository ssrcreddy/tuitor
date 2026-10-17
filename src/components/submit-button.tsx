"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "",
  variant = "primary",
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`btn-${variant} ${className}`}>
      {pending ? "Please wait…" : children}
    </button>
  );
}
