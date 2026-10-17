"use client";

import { useEffect, useState } from "react";

/** Hidden form field carrying the browser's IANA timezone. */
export function TimezoneInput({ name = "timezone" }: { name?: string }) {
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <input type="hidden" name={name} value={tz} />;
}
