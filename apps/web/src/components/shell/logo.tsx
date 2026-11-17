import { useTranslation } from "react-i18next";

export function Logo() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2.5 text-ink">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="font-semibold font-serif text-lg leading-6">
        {t("appName")}
      </span>
    </span>
  );
}
