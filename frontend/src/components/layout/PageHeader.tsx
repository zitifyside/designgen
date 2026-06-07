export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <div className="mb-2 text-xs text-ink-500">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-ink-500">{description}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
