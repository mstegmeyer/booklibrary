import { type ComponentProps, useId } from "react";
import { cn } from "../../lib/cn";

const selectClass =
  "h-10 min-w-0 rounded-lg border border-control bg-surface px-3 text-ink text-sm disabled:border-[#c9cdc7] disabled:bg-sidebar disabled:text-ink-muted";

/** A native select styled like the text fields. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(selectClass, className)} {...props} />;
}

export function SelectField({
  label,
  className,
  ...props
}: ComponentProps<"select"> & { label: string }) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold text-[13px] leading-[18px]">
        {label}
      </label>
      <Select id={id} {...props} />
    </div>
  );
}
