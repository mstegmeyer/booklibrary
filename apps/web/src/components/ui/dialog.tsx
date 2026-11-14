import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  title,
  closeLabel,
  className,
  children,
}: {
  title: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 bg-ink/40" />
      <Primitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl bg-surface px-6 py-6 sm:px-8 sm:py-7",
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
