import {
  ArrowLeftRight,
  BookOpen,
  ChartColumn,
  Library,
  type LucideIcon,
  MapPin,
} from "lucide-react";

export type NavKey =
  | "library"
  | "reading"
  | "statistics"
  | "loans"
  | "locations";

export const navItems: { key: NavKey; to: `/${NavKey}`; icon: LucideIcon }[] = [
  { key: "library", to: "/library", icon: Library },
  { key: "reading", to: "/reading", icon: BookOpen },
  { key: "statistics", to: "/statistics", icon: ChartColumn },
  { key: "loans", to: "/loans", icon: ArrowLeftRight },
  { key: "locations", to: "/locations", icon: MapPin },
];
