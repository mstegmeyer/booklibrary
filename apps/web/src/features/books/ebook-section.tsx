import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { api, unwrap } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { useErrorMessage } from "../../lib/use-error-message";
import { ebookTypes, UploadError } from "./add-book-upload";
import {
  addEbook,
  type BookDetail,
  type FileDetail,
  fileUrl,
  refreshCatalogue,
} from "./queries";

const rowButton =
  "h-11 rounded-[10px] px-3.5 text-[15px] md:h-9 md:rounded-lg md:text-sm";

const formatOf = (file: File) =>
  file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf"
    ? "pdf"
    : "epub";

/** The book's e-book files, with upload, download and removal. */
export function EbookSection({
  book,
  titleClass,
}: {
  book: BookDetail;
  titleClass: string;
}) {
  const { t } = useTranslation(["books", "common"]);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<File>();
  const upload = useMutation({
    mutationFn: ({ file, replace }: { file: File; replace: boolean }) =>
      addEbook(book.id, file, replace),
    onSuccess: async () => {
      setReplacing(undefined);
      await refreshCatalogue(queryClient);
    },
  });

  const choose = (file: File) => {
    if (book.files.some((f) => f.format === formatOf(file))) {
      setReplacing(file);
    } else {
      upload.mutate({ file, replace: false });
    }
  };

  return (
    <section
      aria-labelledby="ebook-title"
      className="flex flex-col gap-2 md:gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="ebook-title" className={titleClass}>
          {t("ebook.title")}
        </h2>
        <button
          type="button"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
          className="h-11 cursor-pointer px-2 font-semibold text-accent text-sm hover:text-accent-hover disabled:opacity-60 md:h-[34px]"
        >
          {upload.isPending ? t("ebook.uploading") : t("ebook.upload")}
        </button>
        <input
          ref={input}
          type="file"
          accept={ebookTypes}
          aria-label={t("ebook.upload")}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) choose(file);
          }}
        />
      </div>
      {!replacing && <UploadError error={upload.error} />}
      {book.files.length === 0 ? (
        <p className="rounded-xl border border-border border-dashed bg-surface px-4 py-6 text-center text-ink-muted text-sm">
          {t("ebook.none")}
        </p>
      ) : (
        <ul className="rounded-xl border border-border bg-surface">
          {book.files.map((file) => (
            <FileRow key={file.id} book={book} file={file} />
          ))}
        </ul>
      )}
      <Dialog
        open={replacing !== undefined}
        onOpenChange={(open) => {
          if (!open) setReplacing(undefined);
        }}
      >
        <DialogContent
          title={t("upload.replaceTitle", {
            format: replacing ? formatOf(replacing).toUpperCase() : "",
          })}
          closeLabel={t("common:form.cancel")}
        >
          <p className="text-sm">{t("upload.replaceText")}</p>
          <UploadError error={upload.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t("common:form.cancel")}</Button>
            </DialogClose>
            <Button
              disabled={upload.isPending}
              onClick={() =>
                replacing && upload.mutate({ file: replacing, replace: true })
              }
            >
              {t("upload.replace")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FileRow({ book, file }: { book: BookDetail; file: FileDetail }) {
  const { t } = useTranslation("books");
  const format = useFormat();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-border border-t px-3.5 py-3 first:border-t-0 md:px-4 md:py-3.5">
      <Smartphone
        aria-hidden
        size={22}
        strokeWidth={1.75}
        className="shrink-0 text-ink-muted"
      />
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <span className="font-semibold text-[15px] leading-5 md:text-sm">
          {t("ebook.file", {
            format: file.format.toUpperCase(),
            size: format.fileSize(file.size),
          })}
        </span>
        <span className="text-[13px] text-ink-muted leading-[18px] [overflow-wrap:anywhere]">
          {file.path}
        </span>
        {file.missing && (
          <span className="font-medium text-[13px] text-danger leading-[18px]">
            {t("ebook.missing")}
          </span>
        )}
        {file.isProtected && (
          <span className="text-[13px] text-ink-muted leading-[18px]">
            {t("ebook.protected")}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {!file.missing && (
          <a
            href={fileUrl(book.id, file.id)}
            download
            className={cn(buttonVariants({ variant: "secondary" }), rowButton)}
          >
            {t("ebook.download")}
          </a>
        )}
        <RemoveFileDialog book={book} file={file} />
      </div>
    </li>
  );
}

function RemoveFileDialog({
  book,
  file,
}: {
  book: BookDetail;
  file: FileDetail;
}) {
  const { t } = useTranslation(["books", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api.books[":id"].files[":fileId"].$delete({
          param: { id: book.id, fileId: file.id },
        }),
      ),
    onSuccess: async ({ bookKept }) => {
      if (!bookKept) await navigate({ to: "/library", replace: true });
      await refreshCatalogue(queryClient);
      setOpen(false);
    },
  });
  const last = book.copies.length === 0 && book.files.length === 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className={rowButton}>
          {file.missing ? t("ebook.removeMissing") : t("ebook.remove")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={file.missing ? t("ebook.missingTitle") : t("ebook.removeTitle")}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">
          {file.missing
            ? t("ebook.missingText")
            : last
              ? t("ebook.removeLast")
              : t("ebook.removeText")}
        </p>
        <FormError>
          {remove.error ? errorMessage(remove.error) : undefined}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
            {file.missing ? t("ebook.removeMissing") : t("ebook.removeSubmit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
