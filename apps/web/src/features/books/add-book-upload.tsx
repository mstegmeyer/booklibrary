import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Field, FormError } from "../../components/ui/field";
import { ApiError } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { CandidateCard } from "./add-book-lookup";
import { type Candidate, type StagedEbook, stageEbook } from "./queries";

export const ebookTypes = ".epub,.pdf,application/epub+zip,application/pdf";

export type Staged = StagedEbook & { name: string };

/** Why an e-book file was not taken, with a link to the book that has it. */
export function UploadError({
  error,
  onOpenBook,
}: {
  error: Error | null;
  onOpenBook?: () => void;
}) {
  const { t } = useTranslation("books");
  const errorMessage = useErrorMessage();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "duplicate_file" && error instanceof ApiError) {
    return (
      <FormError>
        {t("upload.duplicate")}{" "}
        <Link
          to="/books/$bookId"
          params={{ bookId: String(error.details.bookId) }}
          onClick={onOpenBook}
        >
          {t("upload.openBook")}
        </Link>
      </FormError>
    );
  }
  return (
    <FormError>
      {code === "unsupported_file"
        ? t("upload.unsupported")
        : code === "file_too_large"
          ? t("upload.tooLarge")
          : errorMessage(error)}
    </FormError>
  );
}

/**
 * "Upload e-book": reads an EPUB and shows what it says about the book; for
 * a PDF, or an EPUB without a title, the other tabs identify the book.
 */
export function EbookUpload({
  staged,
  onStaged,
  onNotRight,
  onOpenBook,
  children,
}: {
  staged: Staged | undefined;
  onStaged: (staged: Staged) => void;
  onNotRight: (candidate: Candidate) => void;
  onOpenBook: () => void;
  /** The add buttons for the book the file describes. */
  children: (candidate: Candidate) => ReactNode;
}) {
  const { t } = useTranslation("books");
  const upload = useMutation({
    mutationFn: async (file: File) => ({
      ...(await stageEbook(file)),
      name: file.name,
    }),
    onSuccess: onStaged,
  });

  return (
    <div className="flex flex-col gap-5">
      <Field
        label={t("upload.choose")}
        hint={t("upload.hint")}
        type="file"
        accept={ebookTypes}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
        }}
        className="h-auto border-0 px-0 py-1 text-[13px]"
      />
      {upload.isPending && (
        <p role="status" className="text-ink-muted text-sm">
          {t("upload.reading")}
        </p>
      )}
      <UploadError error={upload.error} onOpenBook={onOpenBook} />
      {staged && !upload.isPending && (
        <>
          {staged.isProtected && (
            <p className="rounded-xl bg-sidebar px-3.5 py-3 text-ink-nav text-sm leading-5">
              {t("upload.protected")}
            </p>
          )}
          {staged.candidate ? (
            <>
              <CandidateCard
                candidate={staged.candidate}
                imageUrl={
                  staged.fileCoverUrl ?? staged.candidate.coverPreviewUrl
                }
                onNotRight={onNotRight}
              />
              {children(staged.candidate)}
            </>
          ) : (
            <p className="text-sm">{t("upload.identify")}</p>
          )}
        </>
      )}
    </div>
  );
}
