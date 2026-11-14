import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const buttonVariants = cva(
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm no-underline disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-accent font-semibold text-white hover:bg-accent-hover hover:text-white",
        secondary:
          "border border-control bg-surface font-medium text-ink hover:bg-ground hover:text-ink",
        ghost: "font-medium text-ink hover:bg-sidebar hover:text-ink",
        danger: "px-0 font-semibold text-danger hover:underline",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}
