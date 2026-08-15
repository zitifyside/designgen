import Link from "next/link";

export function UsageCard({
  title,
  used,
  limit,
  ctaHref,
  ctaLabel,
  unit = "",
  note,
}: {
  title: string;
  used: number;
  limit: number | null;
  ctaHref?: string;
  ctaLabel?: string;
  unit?: string;
  note?: string;
}) {
  const pct =
    limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4">
      <div className="text-xs font-medium text-ink-500">{title}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-ink-900">{used}</span>
        {limit !== null && (
          <span className="text-xs text-ink-400">
            / {limit}
            {unit}
          </span>
        )}
        {limit === null && (
          <span className="text-xs text-ink-400">{unit}</span>
        )}
      </div>
      {limit !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full bg-brand-600"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {note && <div className="mt-2 text-[11px] text-ink-500">{note}</div>}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline"
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
