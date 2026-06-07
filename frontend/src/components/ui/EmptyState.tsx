export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-ink-500">{description}</p>
      )}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}
