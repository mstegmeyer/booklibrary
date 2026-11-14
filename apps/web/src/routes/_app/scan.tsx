import { createFileRoute, redirect } from "@tanstack/react-router";
import { ScanPage } from "../../features/scan/scan-page";
import { isInApp } from "../../lib/app-shell";

/** Only the iOS app has a camera to scan with; browsers add by hand. */
export const Route = createFileRoute("/_app/scan")({
  beforeLoad: () => {
    if (!isInApp) throw redirect({ to: "/library", search: { add: true } });
  },
  component: ScanPage,
});
