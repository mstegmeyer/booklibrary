import type { FormEvent, ReactNode } from "react";
import { Logo } from "../../components/shell/logo";
import { Button } from "../../components/ui/button";
import { FormError } from "../../components/ui/field";

/** The centred single-column form used by setup and login. */
export function AuthForm({
  title,
  intro,
  submitLabel,
  pending,
  error,
  onSubmit,
  children,
}: {
  title: string;
  intro: string;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (data: FormData) => void;
  children: ReactNode;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-5 px-6 pt-24 pb-9">
      <Logo />
      <div className="mt-3 flex flex-col gap-2">
        <h1 className="font-semibold font-serif text-[28px] leading-[34px]">
          {title}
        </h1>
        <p className="text-[15px] text-ink-muted leading-[22px]">{intro}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {children}
        <FormError>{error}</FormError>
        <Button
          type="submit"
          disabled={pending}
          className="mt-1 h-[50px] rounded-xl text-base"
        >
          {submitLabel}
        </Button>
      </form>
    </main>
  );
}

export const authInputClass = "h-12 rounded-[10px] px-3.5 text-base";
