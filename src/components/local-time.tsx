"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Renders a timestamp in the viewer's own timezone. The server doesn't know
 * the browser's timezone, so it renders UTC and the client re-renders locally.
 */
export function LocalTime({
  iso,
  options = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  className,
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const text = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: isClient ? undefined : "UTC" }).format(
    new Date(iso),
  );
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
      {!isClient && " UTC"}
    </time>
  );
}
