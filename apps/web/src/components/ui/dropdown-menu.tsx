import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

const itemClass =
  "flex h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-ink text-sm no-underline outline-none data-[highlighted]:bg-sidebar data-[highlighted]:text-ink";

export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "z-50 min-w-52 rounded-xl border border-border bg-surface p-1 shadow-lg",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      className={cn(itemClass, "relative pl-7", className)}
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-3 size-1.5 rounded-full bg-accent" />
      {children}
    </Primitive.RadioItem>
  );
}

export function DropdownMenuLabel(
  props: ComponentProps<typeof Primitive.Label>,
) {
  return (
    <Primitive.Label
      className="px-2 pt-2 pb-1 font-semibold text-ink-muted text-xs"
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Primitive.Separator className="my-1 h-px bg-border" />;
}
