import { useTranslation } from "react-i18next";
import { ApiError } from "./api";

/** A translated message for errors a screen does not handle itself. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error: Error) =>
    error instanceof ApiError ? t("errors.generic") : t("errors.network");
}
