import { Tabs } from "radix-ui";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { useFormat } from "../../lib/format";
import {
  AddQuestion,
  type BookPayload,
  fromCandidate,
  KnownBook,
  useAddBook,
} from "./add-book-flow";
import { IsbnLookup, TitleSearch } from "./add-book-lookup";
import { EbookUpload, type Staged } from "./add-book-upload";
import { BookForm, useBookErrorMessage } from "./book-form";
import { OwnershipFieldset, type OwnershipKind } from "./ownership";
import type { Candidate } from "./queries";

type Tab = "isbn" | "search" | "manual" | "upload";
type Intent = "add" | "next";

const intentOf = (value: string | undefined): Intent =>
  value === "next" ? "next" : "add";

/** "Add a book": by ISBN, by a title search or by hand. */
export function AddBookDialog({
  open,
  onOpenChange,
  own,
  isbn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects how the book is owned; "In our library" otherwise. */
  own?: Exclude<OwnershipKind, "library">;
  /** Opens manual entry with this ISBN filled in. */
  isbn?: string;
}) {
  const { t } = useTranslation(["books", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("add.title")}
        closeLabel={t("common:form.cancel")}
        layout="screen"
        className="max-w-[640px]"
      >
        <AddBook own={own} isbn={isbn} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddBook({
  own,
  isbn,
  onDone,
}: {
  own?: OwnershipKind;
  isbn?: string;
  onDone: () => void;
}) {
  const { t } = useTranslation("books");
  const bookErrorMessage = useBookErrorMessage();
  const format = useFormat();
  const [tab, setTab] = useState<Tab>(isbn ? "manual" : "isbn");
  const [isbnKey, setIsbnKey] = useState(0);
  const [manual, setManual] = useState<{
    key: number;
    values: Partial<BookPayload>;
    coverPreview?: string;
  }>(() => ({ key: 0, values: isbn ? { isbns: [isbn] } : {} }));
  /** An e-book file the book is added with, instead of an ownership. */
  const [ebook, setEbook] = useState<Staged>();
  const [intent, setIntent] = useState<Intent>("add");
  const [added, setAdded] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const startNext = () => {
    flow.skip();
    setEbook(undefined);
    setTab("isbn");
    setIsbnKey((key) => key + 1);
  };

  const flow = useAddBook({
    own,
    ebook,
    onAdded: (message, known) => {
      setEbook(undefined);
      if (intent === "add") return known ? setNotice(message) : onDone();
      setAdded(message);
      startNext();
    },
  });
  const skip = () => (intent === "add" ? onDone() : startNext());

  const submit = (payload: BookPayload, cover: File | null, next: Intent) => {
    setIntent(next);
    setAdded(undefined);
    flow.submit(payload, cover);
  };

  const footer = (
    <>
      {ebook ? (
        <p className="flex flex-wrap items-center gap-x-3 text-sm">
          {t("upload.withFile", {
            name: ebook.name,
            size: format.fileSize(ebook.size),
          })}
          <button
            type="button"
            onClick={() => setEbook(undefined)}
            className="cursor-pointer text-accent underline hover:text-accent-hover"
          >
            {t("upload.removeFile")}
          </button>
        </p>
      ) : (
        <OwnershipFieldset
          value={flow.ownership}
          onChange={flow.setOwnership}
        />
      )}
      {flow.personMissing && <FormError>{t("add.choosePerson")}</FormError>}
      <FormError>
        {flow.error ? bookErrorMessage(flow.error) : undefined}
      </FormError>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          value="add"
          variant="secondary"
          disabled={flow.isPending}
        >
          {t("add.submit")}
        </Button>
        <Button type="submit" value="next" disabled={flow.isPending}>
          {t("add.submitNext")}
        </Button>
      </div>
    </>
  );

  const addFound = (candidate: Candidate) => (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        submit(
          fromCandidate(candidate),
          null,
          intentOf(submitter?.getAttribute("value") ?? undefined),
        );
      }}
      className="flex flex-col gap-5"
    >
      {footer}
    </form>
  );

  const openManual = (values: Partial<BookPayload>, coverPreview?: string) => {
    setManual((m) => ({ key: m.key + 1, values, coverPreview }));
    setTab("manual");
  };
  /** The EPUB's own cover is used when the book is added without a URL. */
  const fromEbook = (candidate: Candidate): BookPayload => ({
    ...fromCandidate(candidate),
    coverUrl: ebook?.fileCoverUrl
      ? undefined
      : (candidate.coverUrl ?? undefined),
  });
  const lookupProps = {
    onNotRight: (candidate: Candidate) => openManual(fromCandidate(candidate)),
    onManual: (isbn?: string) => openManual(isbn ? { isbns: [isbn] } : {}),
    children: addFound,
  };

  if (notice) {
    return (
      <div className="flex flex-col gap-5">
        <p role="status" className="text-sm">
          {notice}
        </p>
        <div className="flex justify-end">
          <Button onClick={onDone}>{t("add.close")}</Button>
        </div>
      </div>
    );
  }

  const { question } = flow;
  if (question?.code === "format_exists" && ebook) {
    return (
      <KnownBook
        bookId={question.bookId}
        title={t("upload.replaceTitle", { format: ebook.format.toUpperCase() })}
      >
        <p className="text-sm">{t("upload.replaceText")}</p>
        <FormError>
          {flow.error ? bookErrorMessage(flow.error) : undefined}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={skip}>
            {t("upload.skip")}
          </Button>
          <Button
            disabled={flow.isPending}
            onClick={() => flow.answer({ replace: true })}
          >
            {t("upload.replace")}
          </Button>
        </div>
      </KnownBook>
    );
  }

  if (question?.code === "isbn_taken" || question?.code === "same_book") {
    return <AddQuestion flow={flow} onSkip={skip} />;
  }

  const tabClass =
    "h-10 cursor-pointer font-medium text-ink-muted text-sm data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_-2px_0_var(--color-accent)]";
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="flex flex-col gap-5"
    >
      <Tabs.List className="flex gap-6 overflow-x-auto border-border border-b">
        <Tabs.Trigger value="isbn" className={tabClass}>
          {t("add.tabs.isbn")}
        </Tabs.Trigger>
        <Tabs.Trigger value="search" className={tabClass}>
          {t("add.tabs.search")}
        </Tabs.Trigger>
        <Tabs.Trigger value="manual" className={tabClass}>
          {t("add.tabs.manual")}
        </Tabs.Trigger>
        <Tabs.Trigger value="upload" className={tabClass}>
          {t("add.tabs.upload")}
        </Tabs.Trigger>
      </Tabs.List>
      {added && (
        <p role="status" className="text-accent text-sm">
          {added}
        </p>
      )}
      <Tabs.Content value="isbn">
        <IsbnLookup key={isbnKey} {...lookupProps} />
      </Tabs.Content>
      <Tabs.Content value="search">
        <TitleSearch {...lookupProps} />
      </Tabs.Content>
      <Tabs.Content value="manual">
        <BookForm
          key={manual.key}
          id="add-book"
          initialValues={manual.values}
          coverUrl={manual.coverPreview ?? manual.values.coverUrl}
          onSubmit={({ sortAs: _, ...values }, cover, intent) =>
            submit(
              {
                ...values,
                // A chosen image replaces the one the lookup found.
                coverUrl: cover ? undefined : manual.values.coverUrl,
                sources: manual.values.sources,
              },
              cover,
              intentOf(intent),
            )
          }
        >
          {footer}
        </BookForm>
      </Tabs.Content>
      <Tabs.Content value="upload">
        <EbookUpload
          staged={ebook}
          onStaged={setEbook}
          onNotRight={(candidate) =>
            openManual(fromEbook(candidate), ebook?.fileCoverUrl ?? undefined)
          }
          onOpenBook={onDone}
        >
          {(candidate) => (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const submitter = (event.nativeEvent as SubmitEvent).submitter;
                submit(
                  fromEbook(candidate),
                  null,
                  intentOf(submitter?.getAttribute("value") ?? undefined),
                );
              }}
              className="flex flex-col gap-5"
            >
              {footer}
            </form>
          )}
        </EbookUpload>
      </Tabs.Content>
    </Tabs.Root>
  );
}
