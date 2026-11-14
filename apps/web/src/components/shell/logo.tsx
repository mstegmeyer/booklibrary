import { Book } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Logo() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2.5 text-ink">
      <Book aria-hidden size={22} strokeWidth={2} className="text-accent" />
      <span className="font-semibold font-serif text-lg leading-6">
        {t("appName")}
      </span>
    </span>
  );
}
