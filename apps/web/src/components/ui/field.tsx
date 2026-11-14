import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

type FieldProps = ComponentProps<"input"> & { label: string; hint?: string };

export function Field({ label, hint, className, ...props }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-[13px] leading-[18px]">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "h-10 rounded-lg border border-control bg-surface px-3 text-ink text-sm",
          className,
        )}
        {...props}
      />
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-[13px] text-ink-muted leading-[18px]"
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-danger text-sm">
      {children}
    </p>
  );
}
