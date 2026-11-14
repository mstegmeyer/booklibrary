import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  LogOut,
  MapPin,
  Server,
  Tags,
  UserRound,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Language, languages } from "../../i18n";
import { changeServer, isInApp } from "../../lib/app-shell";
import { authClient, sessionQuery } from "../../lib/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function Avatar({ name, size }: { name: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "flex size-7 items-center justify-center rounded-full bg-ink font-semibold text-[13px] text-white"
          : "flex size-[34px] items-center justify-center rounded-full bg-ink font-semibold text-sm text-white"
      }
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** The account menu: a full-width row in the sidebar, an avatar at phone width. */
export function AccountMenu({ variant }: { variant: "sidebar" | "avatar" }) {
  const { t, i18n } = useTranslation(["common", "account", "genres"]);
  const { data: session } = useSuspenseQuery(sessionQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const name = session?.user.name ?? "";

  const signOut = async () => {
    // Load the login page's code before the URL changes. If the visitor leaves
    // while that chunk is still loading, Safari aborts it and the router takes
    // the failed import for a new deployment and reloads, hijacking their
    // navigation.
    await Promise.all([
      authClient.signOut(),
      router.loadRouteChunk(router.routesByPath["/login"]),
    ]);
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account.menu", { name })}
        className={
          variant === "sidebar"
            ? "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left font-medium text-ink text-sm hover:bg-accent-tint/60"
            : "flex size-11 cursor-pointer items-center justify-end"
        }
      >
        {variant === "sidebar" ? (
          <>
            <Avatar name={name} size="sm" />
            <span className="flex-1 truncate">{name}</span>
            <ChevronsUpDown aria-hidden size={16} className="text-ink-muted" />
          </>
        ) : (
          <Avatar name={name} size="md" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"}>
        <DropdownMenuLabel>{t("account.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={i18n.resolvedLanguage}
          onValueChange={(language) => i18n.changeLanguage(language)}
        >
          {Object.entries(languages).map(([code, label]) => (
            <DropdownMenuRadioItem
              key={code}
              value={code}
              lang={code as Language}
            >
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* The tab bar has no room for Locations, so on phones it is here. */}
        {variant === "avatar" && (
          <DropdownMenuItem asChild>
            <Link to="/locations">
              <MapPin aria-hidden size={16} />
              {t("nav.locations")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/genres">
            <Tags aria-hidden size={16} />
            {t("genres:title")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserRound aria-hidden size={16} />
            {t("account:title")}
          </Link>
        </DropdownMenuItem>
        {session?.user.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link to="/users">
              <Users aria-hidden size={16} />
              {t("account.users")}
            </Link>
          </DropdownMenuItem>
        )}
        {isInApp && (
          <DropdownMenuItem onSelect={changeServer}>
            <Server aria-hidden size={16} />
            {t("account.changeServer")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden size={16} />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
