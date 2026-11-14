import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isInApp } from "../../lib/app-shell";
import { type NavKey, navItems } from "./nav";

const tabs: NavKey[] = ["library", "reading", "loans", "statistics"];

export function TabBar() {
  const { t } = useTranslation();
  const tab = (key: NavKey) => {
    const item = navItems.find((i) => i.key === key);
    if (!item) return null;
    const { to, icon: Icon } = item;
    return (
      <Link
        key={key}
        to={to}
        className="flex h-[46px] flex-1 flex-col items-center justify-center gap-[3px] font-medium text-[11px] text-ink-muted leading-[13px] no-underline hover:text-ink-muted data-[status=active]:text-accent"
      >
        <Icon aria-hidden size={22} strokeWidth={1.75} />
        {t(`nav.${key}`)}
      </Link>
    );
  };

  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 flex items-start border-border border-t bg-surface px-2 pt-1 pb-[max(env(safe-area-inset-bottom),8px)]"
    >
      {tabs.slice(0, 2).map(tab)}
      <Link
        {...(isInApp
          ? { to: "/scan" }
          : { to: "/library", search: { add: true } })}
        aria-label={t("nav.addBook")}
        className="mx-2.5 flex size-[46px] shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover hover:text-white"
      >
        <Plus aria-hidden size={24} strokeWidth={2} />
      </Link>
      {tabs.slice(2).map(tab)}
    </nav>
  );
}
