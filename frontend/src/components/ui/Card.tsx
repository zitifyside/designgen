import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & { padded?: boolean };

export function Card({ className, padded = true, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-ink-200 bg-white",
        padded && "p-5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-ink-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
