import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/ui/field";
import { TextareaField } from "../../components/ui/textarea-field";
import { ApiError } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { BookCover } from "./book-cover";

export type BookFormValues = {
  title: string;
  subtitle: string | null;
  authors: string[];
  /** Only when editing; empty means the server's guess. */
  sortAs?: string;
  description: string | null;
  pageCount: number | null;
  publishedYear: number | null;
  language: string | null;
  isbns: string[];
};

const list = (value: FormDataEntryValue | null, separator: RegExp) =>
  String(value ?? "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
const text = (value: FormDataEntryValue | null) =>
  String(value ?? "").trim() || null;
const number = (value: FormDataEntryValue | null) =>
  value ? Number(value) : null;

/**
 * The book's metadata and cover. It keeps no state of its own beyond the
 * inputs: pass `initialValues` (and a new `key` to start over) to prefill it.
 */
export function BookForm({
  id,
  initialValues = {},
  coverUrl = null,
  withSortAs = false,
  onSubmit,
  children,
}: {
  id: string;
  initialValues?: Partial<BookFormValues>;
  /** The current cover, shown until another image is chosen. */
  coverUrl?: string | null;
  withSortAs?: boolean;
  /**
   * `intent` is the `value` of the submit button that was pressed, so a form
   * can offer several ways to submit.
   */
  onSubmit: (
    values: BookFormValues,
    cover: File | null,
    intent: string | undefined,
  ) => void;
  /** Further fields, errors and the submit buttons. */
  children: ReactNode;
}) {
  const { t } = useTranslation("books");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) return;
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    onSubmit(
      {
        title: String(data.get("title")).trim(),
        subtitle: text(data.get("subtitle")),
        authors: list(data.get("authors"), /,/),
        sortAs: withSortAs ? String(data.get("sortAs")).trim() : undefined,
        description: text(data.get("description")),
        pageCount: number(data.get("pageCount")),
        publishedYear: number(data.get("publishedYear")),
        language: text(data.get("language")),
        isbns: list(data.get("isbns"), /[,;\n]/),
      },
      cover,
      submitter?.getAttribute("value") ?? undefined,
    );
  };

  return (
    <form id={id} onSubmit={submit} className="flex flex-col gap-4">
      <Field
        label={t("form.title")}
        name="title"
        defaultValue={initialValues.title}
        maxLength={500}
        required
      />
      <Field
        label={t("form.subtitle")}
        name="subtitle"
        defaultValue={initialValues.subtitle ?? ""}
        maxLength={500}
      />
      <Field
        label={t("form.authors")}
        hint={t("form.authorsHint")}
        name="authors"
        defaultValue={initialValues.authors?.join(", ")}
      />
      {withSortAs && (
        <Field
          label={t("form.sortAs")}
          hint={t("form.sortAsHint")}
          name="sortAs"
          defaultValue={initialValues.sortAs}
          maxLength={200}
        />
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={t("form.pages")}
          name="pageCount"
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          defaultValue={initialValues.pageCount ?? ""}
          className="w-full min-w-0"
        />
        <Field
          label={t("form.year")}
          name="publishedYear"
          type="number"
          inputMode="numeric"
          min={0}
          max={9999}
          defaultValue={initialValues.publishedYear ?? ""}
          className="w-full min-w-0"
        />
        <Field
          label={t("form.language")}
          name="language"
          defaultValue={initialValues.language ?? ""}
          maxLength={50}
          className="w-full min-w-0"
        />
      </div>
      <Field
        label={t("form.isbns")}
        hint={t("form.isbnsHint")}
        name="isbns"
        inputMode="numeric"
        defaultValue={initialValues.isbns?.join(", ")}
        className="tabular-nums"
      />
      <TextareaField
        label={t("form.description")}
        name="description"
        defaultValue={initialValues.description ?? ""}
        maxLength={10000}
      />
      <div className="flex items-center gap-4">
        <BookCover
          id={id}
          title={initialValues.title ?? ""}
          authors={[]}
          imageUrl={preview ?? coverUrl}
          size="small"
        />
        <Field
          label={t("form.cover")}
          type="file"
          accept="image/*"
          onChange={(event) => setCover(event.target.files?.[0] ?? null)}
          className="h-auto border-0 px-0 py-1 text-[13px]"
        />
      </div>
      {children}
    </form>
  );
}

/** Messages for the errors creating or editing a book can run into. */
export function useBookErrorMessage() {
  const { t } = useTranslation("books");
  const errorMessage = useErrorMessage();
  return (error: Error) => {
    if (error instanceof ApiError) {
      if (error.code === "validation_failed" && error.message.includes("isbns"))
        return t("form.isbnInvalid");
      if (error.code === "bad_request" && error.message.includes("image"))
        return t("form.imageInvalid");
      if (error.code === "isbn_taken") return t("edit.isbnTaken");
    }
    return errorMessage(error);
  };
}
