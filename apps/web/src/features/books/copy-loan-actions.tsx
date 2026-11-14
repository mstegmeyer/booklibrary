import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { LendCopyDialog } from "../loans/lend-dialog";
import { ReturnDialog } from "../loans/loan-dialogs";
import { fetchCopyLoan } from "../loans/queries";
import type { BookDetail, CopyDetail } from "./queries";

const rowButton =
  "h-11 rounded-[10px] px-3.5 text-[15px] md:h-9 md:rounded-lg md:text-sm";

/** Loan buttons in a copy's row: "Lend", or "Mark returned" while it is lent. */
export function CopyLoanActions({
  book,
  copy,
}: {
  book: BookDetail;
  copy: CopyDetail;
}) {
  const { t } = useTranslation("loans");

  if (!copy.loan) {
    return (
      <LendCopyDialog
        book={book}
        copy={copy}
        trigger={
          <Button variant="secondary" className={rowButton}>
            {t("lend.submit")}
          </Button>
        }
      />
    );
  }

  return (
    <ReturnDialog
      startedOn={copy.loan.startedOn}
      loanId={async () => {
        const loan = await fetchCopyLoan(copy.id);
        if (!loan) throw new Error("The copy is not lent out any more");
        return loan.id;
      }}
      trigger={
        <Button
          variant="secondary"
          aria-label={t("markReturned")}
          className={rowButton}
        >
          <span className="md:hidden">{t("returnedShort")}</span>
          <span className="hidden md:inline">{t("markReturned")}</span>
        </Button>
      }
    />
  );
}
