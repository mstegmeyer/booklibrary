import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "../ui/button";
import { AccountMenu } from "./account-menu";
import { Logo } from "./logo";
import { navItems } from "./nav";

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.main")}
      className="flex h-full flex-col gap-5 px-4 py-6"
    >
      <Link to="/library" className="px-2 no-underline">
        <Logo />
      </Link>
      <Link to="/add" className={buttonVariants()}>
        <Plus aria-hidden size={16} strokeWidth={2.25} />
        {t("nav.addBook")}
      </Link>
      <ul className="flex flex-col gap-0.5">
        {navItems.map(({ key, to, icon: Icon }) => (
          <li key={key}>
            <Link
              to={to}
              className="flex h-10 items-center gap-3 rounded-lg px-3 font-medium text-ink-nav text-sm no-underline hover:bg-accent-tint/60 hover:text-ink-nav data-[status=active]:bg-accent-tint data-[status=active]:font-semibold data-[status=active]:text-accent-hover"
            >
              <Icon aria-hidden size={18} strokeWidth={1.75} />
              {t(`nav.${key}`)}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-sidebar-line border-t pt-4">
        <AccountMenu variant="sidebar" />
      </div>
    </nav>
  );
}
