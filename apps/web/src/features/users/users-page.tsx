import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import { useFormat } from "../../lib/format";
import { sessionQuery } from "../../lib/session";
import { AddUserDialog } from "./add-user-dialog";
import { usersQuery } from "./queries";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RemoveUserDialog, RoleDialog } from "./user-actions";

export function UsersPage() {
  const { t } = useTranslation("users");
  const format = useFormat();
  const users = useInfiniteQuery(usersQuery);
  const { data: session } = useSuspenseQuery(sessionQuery);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<AddUserDialog />}
      />
      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {users.data?.pages
          .flatMap((page) => page.items)
          .map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-border border-t px-4 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-sm">
                    {user.name}
                  </span>
                  <span className="rounded-full bg-accent-tint px-2 font-medium text-accent-hover text-xs leading-[18px]">
                    {t(`roles.${user.role}`)}
                  </span>
                </div>
                <p className="truncate text-[13px] text-ink-muted leading-[18px]">
                  {user.email} ·{" "}
                  {t("added", { date: format.date(user.createdAt) })}
                </p>
              </div>
              {/* Your own password is changed on the Account page. */}
              {user.id !== session?.user.id && (
                <div className="flex flex-wrap gap-2">
                  <ResetPasswordDialog user={user} />
                  <RoleDialog user={user} />
                  <RemoveUserDialog user={user} />
                </div>
              )}
            </li>
          ))}
      </ul>
      {users.hasNextPage && (
        <Button
          variant="secondary"
          className="mx-auto mt-4 flex"
          disabled={users.isFetchingNextPage}
          onClick={() => users.fetchNextPage()}
        >
          {t("loadMore")}
        </Button>
      )}
    </>
  );
}
