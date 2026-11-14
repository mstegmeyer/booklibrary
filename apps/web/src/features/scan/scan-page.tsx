import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X, Zap } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { FormError } from "../../components/ui/field";
import { ApiError } from "../../lib/api";
import {
  checkTorch,
  onBarcode,
  type ScanError,
  setLightStatusBar,
  setTorch,
  startScan,
  stopScan,
} from "../../lib/app-shell";
import { cn } from "../../lib/cn";
import { useErrorMessage } from "../../lib/use-error-message";
import { AddBookDialog } from "../books/add-book-dialog";
import { AddQuestion, fromCandidate, useAddBook } from "../books/add-book-flow";
import { Problem } from "../books/add-book-lookup";
import { BookCover } from "../books/book-cover";
import { useBookErrorMessage } from "../books/book-form";
import { CopyFormatSelect } from "../books/copy-dialogs";
import { OwnershipFieldset } from "../books/ownership";
import { type Candidate, lookupIsbn } from "../books/queries";
import { GenreSelect } from "../genres/genre-select";

/**
 * The scan screen on display, so that the late answer to an earlier
 * `startScan` does not stop the scan of a screen opened since.
 */
let shown: symbol | undefined;

const textButton =
  "h-11 cursor-pointer rounded-[10px] px-2 font-semibold text-[15px] text-accent hover:text-accent-hover";

/**
 * Adds books one after another by their barcodes, with the camera of the iOS
 * app (see `lib/app-shell.ts`) showing through the page.
 */
export function ScanPage() {
  const { t } = useTranslation(["scan", "books"]);
  const errorMessage = useErrorMessage();
  const bookErrorMessage = useBookErrorMessage();
  const [camera, setCamera] = useState<"starting" | "running" | ScanError>(
    "starting",
  );
  /** `undefined` while the device has no torch. */
  const [torch, setTorchOn] = useState<boolean>();
  const [notIsbn, setNotIsbn] = useState(false);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<string>();
  /** The Add dialog is open, with manual entry when there is an ISBN. */
  const [adding, setAdding] = useState<{ isbn?: string }>();
  const isAdding = adding !== undefined;
  const [genreId, setGenreId] = useState("");
  const lookup = useMutation({
    mutationFn: lookupIsbn,
    onSuccess: (found) => {
      setGenreId(found.genreId ?? "");
      flow.prefillFormat(found);
    },
  });
  const flow = useAddBook({
    onAdded: (message) => {
      setCount((count) => count + 1);
      setStatus(message);
      lookup.reset();
    },
  });

  // The Add dialog covers the screen, so the camera is off while it is open.
  useEffect(() => {
    if (isAdding) return;
    const self = Symbol();
    shown = self;
    // The screen is dark at the top, with or without the camera.
    setLightStatusBar(true).catch(() => {});
    startScan().then(
      () => {
        if (shown === self) setCamera("running");
        // Closed while the camera was starting, and not opened again.
        else if (shown === undefined) stopScan().catch(() => {});
      },
      (error: Error) =>
        shown === self &&
        setCamera(error.message === "denied" ? "denied" : "unavailable"),
    );
    checkTorch().then(
      () => shown === self && setTorchOn(false),
      () => {},
    );
    return () => {
      shown = undefined;
      stopScan().catch(() => {});
      setLightStatusBar(false).catch(() => {});
      setCamera("starting");
      setTorchOn(undefined);
    };
  }, [isAdding]);

  useEffect(() => {
    if (camera !== "running") return;
    const { documentElement: html, body } = document;
    html.style.background = body.style.background = "transparent";
    return () => {
      html.style.background = body.style.background = "";
    };
  }, [camera]);

  const showing =
    lookup.isPending ||
    lookup.data !== undefined ||
    flow.question !== undefined;
  const { mutate } = lookup;
  useEffect(
    () =>
      onBarcode((code) => {
        if (showing) return;
        if (!/^97[89]\d{10}$/.test(code)) return setNotIsbn(true);
        setStatus(undefined);
        mutate(code);
      }),
    [showing, mutate],
  );

  useEffect(() => {
    if (!notIsbn) return;
    const timer = setTimeout(() => setNotIsbn(false), 2000);
    return () => clearTimeout(timer);
  }, [notIsbn]);

  const typeIsbn = (
    <button type="button" className={textButton} onClick={() => setAdding({})}>
      {t("typeIsbn")}
    </button>
  );
  const code = lookup.error instanceof ApiError ? lookup.error.code : undefined;

  let sheet: ReactNode;
  if (camera === "denied" || camera === "unavailable") {
    sheet = (
      <>
        <p role="alert" className="text-sm">
          {t(camera)}
        </p>
        {typeIsbn}
      </>
    );
  } else if (flow.question) {
    sheet = <AddQuestion flow={flow} onSkip={() => lookup.reset()} />;
  } else if (lookup.data) {
    const candidate = lookup.data;
    sheet = (
      <>
        <ScannedBook candidate={candidate} />
        {!candidate.bookId && (
          <GenreSelect
            value={genreId}
            onChange={(event) => setGenreId(event.target.value)}
          />
        )}
        <OwnershipFieldset
          value={flow.ownership}
          onChange={flow.setOwnership}
        />
        {flow.ownership.kind === "library" && (
          <CopyFormatSelect
            value={flow.ownership.format}
            onChange={(event) =>
              flow.setOwnership({
                ...flow.ownership,
                format: event.target.value,
              })
            }
          />
        )}
        {flow.personMissing && (
          <FormError>{t("books:add.choosePerson")}</FormError>
        )}
        <FormError>
          {flow.error ? bookErrorMessage(flow.error) : undefined}
        </FormError>
        <Button
          className="h-[50px] rounded-xl text-base"
          disabled={flow.isPending}
          onClick={() =>
            flow.submit(
              { ...fromCandidate(candidate), genreId: genreId || null },
              null,
            )
          }
        >
          {t("addNext")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={textButton}
            onClick={() => lookup.reset()}
          >
            {t("notThis")}
          </button>
          {typeIsbn}
        </div>
      </>
    );
  } else {
    sheet = (
      <>
        {lookup.isPending ? (
          <p role="status" className="text-ink-muted text-sm">
            {t("books:lookup.searching")}
          </p>
        ) : code === "metadata_not_found" ? (
          <Problem text={t("books:lookup.notFound")}>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding({ isbn: lookup.variables });
                lookup.reset();
              }}
            >
              {t("enterByHand")}
            </Button>
          </Problem>
        ) : code === "metadata_unavailable" ? (
          <Problem text={t("books:lookup.unavailable")}>
            <Button
              variant="secondary"
              onClick={() => lookup.variables && mutate(lookup.variables)}
            >
              {t("books:lookup.tryAgain")}
            </Button>
          </Problem>
        ) : lookup.error ? (
          <p role="alert" className="text-sm">
            {code === "invalid_isbn"
              ? t("invalid")
              : errorMessage(lookup.error)}
          </p>
        ) : (
          <>
            {status && (
              <p role="status" className="text-accent text-sm">
                {status}
              </p>
            )}
            <p className="text-sm">{t("prompt")}</p>
          </>
        )}
        {typeIsbn}
      </>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-10 flex flex-col pt-[env(safe-area-inset-top)] text-white",
        camera !== "running" && "bg-[#0e1110]",
      )}
    >
      <header className="flex h-11 items-center justify-between px-2">
        <Link
          to="/library"
          aria-label={t("close")}
          className="flex size-11 items-center justify-center text-white hover:text-white"
        >
          <X aria-hidden size={24} />
        </Link>
        <h1 className="font-semibold text-base">{t("title")}</h1>
        {torch === undefined ? (
          <span className="size-11" />
        ) : (
          <button
            type="button"
            aria-label={t("torch")}
            aria-pressed={torch}
            onClick={() =>
              setTorch(!torch).then(
                () => setTorchOn(!torch),
                () => {},
              )
            }
            className={cn(
              "flex size-11 cursor-pointer items-center justify-center",
              torch && "text-[#7fd1ae]",
            )}
          >
            <Zap aria-hidden size={22} fill={torch ? "currentColor" : "none"} />
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
        {camera === "running" && (
          <>
            <div
              aria-hidden
              className="relative h-[150px] w-[290px] max-w-full rounded-2xl border-2 border-white"
            >
              <div className="absolute inset-x-4 top-[72px] h-0.5 rounded-[1px] bg-[#7fd1ae]" />
            </div>
            <p
              role={notIsbn ? "status" : undefined}
              className="max-w-[250px] text-center text-[#d5d9d4] text-sm"
            >
              {notIsbn ? t("notIsbn") : t("hint")}
            </p>
          </>
        )}
      </div>
      <section
        aria-label={t("title")}
        className="flex max-h-[75dvh] flex-col gap-3.5 overflow-y-auto rounded-t-[20px] bg-surface px-5 pt-5 pb-[max(env(safe-area-inset-bottom),20px)] text-ink"
      >
        {sheet}
        <div className="flex items-center justify-between gap-3 border-border border-t pt-2.5">
          <span className="text-[13px] text-ink-muted leading-[18px]">
            {t("added", { count })}
          </span>
          <Link
            to="/library"
            className="flex h-11 items-center pl-4 font-semibold text-[15px] no-underline"
          >
            {t("done")}
          </Link>
        </div>
      </section>
      <AddBookDialog
        open={isAdding}
        onOpenChange={(open) => !open && setAdding(undefined)}
        isbn={adding?.isbn}
        onAdded={(message) => {
          setCount((count) => count + 1);
          setStatus(message);
        }}
      />
    </div>
  );
}

/** The book a barcode found, as the scan board shows it. */
function ScannedBook({ candidate }: { candidate: Candidate }) {
  const { t, i18n } = useTranslation(["scan", "books"]);
  const sources = new Intl.ListFormat(i18n.resolvedLanguage).format(
    candidate.sources.map((source) => t(`books:sources.${source}`)),
  );
  const facts = [
    candidate.pageCount &&
      t("books:page.pages", { count: candidate.pageCount }),
    t("foundOn", { sources }),
  ].filter(Boolean);

  return (
    <div className="flex gap-3.5">
      <BookCover
        id={candidate.isbn13 ?? candidate.title}
        title={candidate.title}
        authors={candidate.authors}
        imageUrl={candidate.coverPreviewUrl}
        size="small"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold font-serif text-lg leading-[23px]">
          {candidate.title}
        </span>
        <span className="text-sm">{candidate.authors.join(", ")}</span>
        <span className="text-[13px] text-ink-muted leading-[18px]">
          {facts.join(" · ")}
        </span>
      </div>
    </div>
  );
}
