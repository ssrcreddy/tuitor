export function Avatar({ name, url, size = 72 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover" />;
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-xl bg-brand-soft text-xl font-semibold text-brand"
    >
      {initials}
    </div>
  );
}
