import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold font-serif text-[30px] leading-9">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-ink-muted text-sm leading-5">{subtitle}</p>
          )}
        </div>
        <div className="md:hidden">
          <AccountMenu variant="avatar" />
        </div>
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface px-6 py-16 text-center text-ink-muted text-sm">
      {children}
    </div>
  );
}
