import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../../components/shell/page-header";

export const Route = createFileRoute("/_app/loans")({
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.loans")} />
      <EmptyState>{t("pages.empty")}</EmptyState>
    </>
  );
}
