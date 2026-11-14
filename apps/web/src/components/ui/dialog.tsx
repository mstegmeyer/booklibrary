import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

// In the iOS app the page runs under the status bar and the home indicator,
// so every layout keeps clear of the safe areas.
const layouts = {
  center: "",
  /** At phone width, a sheet at the bottom of the screen. */
  sheet:
    "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[calc(100dvh-max(48px,env(safe-area-inset-top)+16px))] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:px-5 max-md:pb-[max(32px,env(safe-area-inset-bottom))]",
  /** At phone width, the whole screen. */
  screen:
    "max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:px-4 max-sm:pt-[max(24px,env(safe-area-inset-top))] max-sm:pb-[max(24px,env(safe-area-inset-bottom))]",
};

export function DialogContent({
  title,
  closeLabel,
  layout = "center",
  className,
  children,
}: {
  title: string;
  closeLabel: string;
  layout?: keyof typeof layouts;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <Primitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2*max(16px,env(safe-area-inset-top),env(safe-area-inset-bottom)))] w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl bg-surface px-6 py-6 sm:px-8 sm:py-7",
          layouts[layout],
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <Primitive.Title className="font-semibold font-serif text-2xl leading-[30px]">
            {title}
          </Primitive.Title>
          <Primitive.Close
            aria-label={closeLabel}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-sidebar"
          >
            <X aria-hidden size={20} />
          </Primitive.Close>
        </div>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
