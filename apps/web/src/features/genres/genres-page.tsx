import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useErrorMessage } from "../../lib/use-error-message";
import { genresQuery, useSortedGenres } from "./queries";

type ListedGenre = ReturnType<typeof useSortedGenres>[number];

/** Genre changes show on books, in the Library and in the statistics. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [genresQuery.queryKey, ["library"], ["books"], ["statistics"]].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

function useGenreErrorMessage() {
  const { t } = useTranslation("genres");
  const errorMessage = useErrorMessage();
  return (error: Error) =>
    error instanceof ApiError && error.code === "genre_exists"
      ? t("exists")
      : errorMessage(error);
}

export function GenresPage() {
  const { t } = useTranslation("genres");
  const { isSuccess } = useQuery(genresQuery);
  const genres = useSortedGenres();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = genres.find((genre) => genre.id === selectedId);
  const panel = useRef<HTMLElement>(null);

  // On phones the panel sits below the whole list.
  useEffect(() => {
    if (selectedId) panel.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<AddGenreDialog onCreated={setSelectedId} />}
      />
      {isSuccess && genres.length === 0 && (
        <EmptyState>{t("empty")}</EmptyState>
      )}
      {genres.length > 0 && (
        <div className="flex flex-wrap items-start gap-8">
          <ul
            aria-label={t("title")}
            className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-xl border border-border bg-surface"
          >
            {genres.map((genre) => (
              <li
                key={genre.id}
                className="border-border border-t first:border-t-0"
              >
                <button
                  type="button"
                  aria-pressed={genre.id === selectedId}
                  onClick={() => setSelectedId(genre.id)}
                  className={cn(
                    "flex h-11 w-full cursor-pointer items-center gap-2 px-4 text-left text-sm",
                    genre.id === selectedId
                      ? "bg-accent-tint font-semibold"
                      : "bg-surface hover:bg-ground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{genre.label}</span>
                  <span className="text-[13px] text-ink-muted tabular-nums">
                    {genre.bookCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section
            ref={panel}
            aria-label={selected?.label}
            className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-xl border border-border bg-surface p-5"
          >
            {selected ? (
              <GenrePanel
                key={selected.id}
                genre={selected}
                onDeleted={() => setSelectedId(undefined)}
              />
            ) : (
              <p className="text-ink-muted text-sm">{t("noSelection")}</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function AddGenreDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation(["genres", "common"]);
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const genreErrorMessage = useGenreErrorMessage();
  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.genres.$post({ json: { name } })),
    onSuccess: async (created) => {
      await refresh();
      setOpen(false);
      onCreated(created.id);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="max-md:h-11 max-md:w-full">{t("add")}</Button>
      </DialogTrigger>
      <DialogContent title={t("addTitle")} closeLabel={t("common:form.cancel")}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t("name")}
            name="name"
            autoComplete="off"
            maxLength={100}
            required
          />
          <FormError>
            {create.error ? genreErrorMessage(create.error) : undefined}
          </FormError>
          <Button
            type="submit"
            disabled={create.isPending}
            className="self-start max-md:h-11"
          >
            {t("addSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenrePanel({
  genre,
  onDeleted,
}: {
  genre: ListedGenre;
  onDeleted: () => void;
}) {
  const { t } = useTranslation(["genres", "common"]);
  const refresh = useRefresh();
  const genreErrorMessage = useGenreErrorMessage();
  const save = useMutation({
    mutationFn: (name: string) =>
      unwrap(
        api.genres[":id"].$patch({ param: { id: genre.id }, json: { name } }),
      ),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="break-words font-semibold font-serif text-[22px] leading-7">
          {genre.label}
        </h2>
        <span className="text-[13px] text-ink-muted leading-[18px]">
          {t("books", { count: genre.bookCount })}
        </span>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t("name")}
          name="name"
          defaultValue={genre.label}
          autoComplete="off"
          maxLength={100}
          required
        />
        <FormError>{save.error && genreErrorMessage(save.error)}</FormError>
        <Button
          type="submit"
          disabled={save.isPending}
          className="self-start max-md:h-11"
        >
          {t("save")}
        </Button>
      </form>
      <div className="border-border border-t pt-3">
        <DeleteGenreDialog genre={genre} onDeleted={onDeleted} />
      </div>
    </>
  );
}

function DeleteGenreDialog({
  genre,
  onDeleted,
}: {
  genre: ListedGenre;
  onDeleted: () => void;
}) {
  const { t } = useTranslation(["genres", "common"]);
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const errorMessage = useErrorMessage();
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.genres[":id"].$delete({ param: { id: genre.id } })),
    onSuccess: async () => {
      setOpen(false);
      onDeleted();
      await refresh();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        remove.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger" className="max-md:h-11">
          {t("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t("deleteTitle", { name: genre.label })}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">{t("deleteText", { count: genre.bookCount })}</p>
        <FormError>{remove.error && errorMessage(remove.error)}</FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t("deleteSubmit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
