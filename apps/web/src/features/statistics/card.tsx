import { type ReactNode, useId } from "react";

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-3.5 md:gap-5 md:p-5"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          id={id}
          className="font-semibold text-sm leading-5 md:text-[15px] md:leading-[22px]"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
