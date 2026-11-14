import { type ComponentProps, useId } from "react";
import { cn } from "../../lib/cn";

export function TextareaField({
  label,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-[13px] leading-[18px]">
        {label}
      </label>
      <textarea
        id={id}
        className={cn(
          "min-h-24 rounded-lg border border-control bg-surface px-3 py-2 text-ink text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}
