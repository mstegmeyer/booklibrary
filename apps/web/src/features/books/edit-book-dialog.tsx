import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import {
  BookForm,
  type BookFormValues,
  useBookErrorMessage,
} from "./book-form";
import { type BookDetail, refreshCatalogue, uploadCover } from "./queries";

export function EditBookDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["books", "common"]);
  const queryClient = useQueryClient();
  const bookErrorMessage = useBookErrorMessage();

  const save = useMutation({
    mutationFn: async (input: {
      values: BookFormValues;
      cover: File | null;
    }) => {
      await unwrap(
        api.books[":id"].$patch({ param: { id: book.id }, json: input.values }),
      );
      if (input.cover) await uploadCover(book.id, input.cover);
    },
    onSuccess: async () => {
      await refreshCatalogue(queryClient);
      onOpenChange(false);
    },
  });

  const otherBookId =
    save.error instanceof ApiError && save.error.code === "isbn_taken"
      ? String(save.error.details.bookId)
      : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        save.reset();
      }}
    >
      <DialogContent
        title={t("edit.title")}
        closeLabel={t("common:form.cancel")}
        className="max-w-[640px]"
      >
        <BookForm
          id={book.id}
          initialValues={{ ...book, genreId: book.genre?.id ?? null }}
          coverUrl={book.thumbnailUrl}
          withSortAs
          onSubmit={(values, cover) => {
            // Kept as shown, the key would still sort by the old author.
            const staleSortAs =
              values.authors[0] !== book.authors[0] &&
              values.sortAs === book.sortAs;
            save.mutate({
              values: staleSortAs ? { ...values, sortAs: "" } : values,
              cover,
            });
          }}
        >
          <FormError>
            {save.error && bookErrorMessage(save.error)}
            {otherBookId && (
              <>
                {" "}
                <Link
                  to="/books/$bookId"
                  params={{ bookId: otherBookId }}
                  onClick={() => onOpenChange(false)}
                >
                  {t("edit.openOther")}
                </Link>
              </>
            )}
          </FormError>
          <Button
            type="submit"
            disabled={save.isPending}
            className="mt-2 self-end"
          >
            {t("common:form.save")}
          </Button>
        </BookForm>
      </DialogContent>
    </Dialog>
  );
}
