import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import { Field, FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useErrorMessage } from "../../lib/use-error-message";
import { coverColor } from "../books/book-cover";
import { AddLocationDialog } from "./add-location-dialog";
import { LocationSelect } from "./location-select";
import { formatPath, type LocationNode, locationsQuery } from "./queries";

export function LocationsPage() {
  const { t } = useTranslation("locations");
  const { data: locations } = useQuery(locationsQuery);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = locations?.find((node) => node.id === selectedId);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <AddLocationDialog
            trigger={<Button>{t("add")}</Button>}
            onCreated={setSelectedId}
          />
        }
      />
      {locations?.length === 0 && <EmptyState>{t("empty")}</EmptyState>}
      {locations && locations.length > 0 && (
        <div className="flex flex-wrap items-start gap-8">
          <ul className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-xl border border-border bg-surface">
            {locations.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                hasChildren={locations.some((n) => n.parentId === node.id)}
                selected={node.id === selectedId}
                onSelect={() => setSelectedId(node.id)}
              />
            ))}
          </ul>
          <section
            aria-label={selected?.name}
            className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-xl border border-border bg-surface p-5"
          >
            {selected ? (
              <LocationPanel
                key={selected.id}
                node={selected}
                hasChildren={locations.some((n) => n.parentId === selected.id)}
                onSelect={setSelectedId}
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

function TreeRow({
  node,
  hasChildren,
  selected,
  onSelect,
}: {
  node: LocationNode;
  hasChildren: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const depth = node.path.length - 1;
  return (
    <li className="border-border border-t first:border-t-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        style={{ paddingLeft: 16 + depth * 24 }}
        className={cn(
          "flex h-11 w-full cursor-pointer items-center gap-2 pr-4 text-left text-sm",
          selected ? "bg-accent-tint" : "bg-surface hover:bg-ground",
          (selected || depth === 0) && "font-semibold",
        )}
      >
        {hasChildren ? (
          <ChevronDown aria-hidden size={16} className="text-ink-muted" />
        ) : (
          <span aria-hidden className="w-4" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="text-[13px] text-ink-muted tabular-nums">
          {node.bookCount}
        </span>
      </button>
    </li>
  );
}

function LocationPanel({
  node,
  hasChildren,
  onSelect,
}: {
  node: LocationNode;
  hasChildren: boolean;
  onSelect: (id: string | undefined) => void;
}) {
  const { t } = useTranslation(["locations", "common"]);
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [parentId, setParentId] = useState(node.parentId ?? "");

  const refresh = () =>
    Promise.all(
      [locationsQuery.queryKey, ["library"], ["books"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const save = useMutation({
    mutationFn: (json: { name: string; parentId: string | null }) =>
      unwrap(api.locations[":id"].$patch({ param: { id: node.id }, json })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.locations[":id"].$delete({ param: { id: node.id } })),
    onSuccess: async () => {
      onSelect(undefined);
      await refresh();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({
      name: String(new FormData(event.currentTarget).get("name")),
      parentId: parentId || null,
    });
  };

  const blockedReason = hasChildren
    ? t("blockedByChildren")
    : node.bookCount > 0
      ? t("blockedByBooks", { count: node.bookCount })
      : undefined;
  const error = save.error ?? remove.error;

  return (
    <>
      <div className="flex flex-col gap-1">
        {node.path.length > 1 && (
          <span className="text-[13px] text-ink-muted leading-[18px]">
            {formatPath(node.path.slice(0, -1))}
          </span>
        )}
        <h2 className="font-semibold font-serif text-[22px] leading-7">
          {node.name}
        </h2>
      </div>
      {node.bookCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <Spines id={node.id} count={node.bookCount} />
          <Link
            to="/library"
            search={{ location: node.id }}
            className="font-semibold text-sm no-underline"
          >
            {t("showBooks", { count: node.bookCount })}
          </Link>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t("name")}
          name="name"
          defaultValue={node.name}
          autoComplete="off"
          maxLength={100}
          required
        />
        <LocationSelect
          label={t("inside")}
          noneLabel={t("topLevel")}
          exclude={node.id}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        />
        <FormError>
          {error &&
            (error instanceof ApiError && error.code === "location_cycle"
              ? t("cycle")
              : errorMessage(error))}
        </FormError>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {t("save")}
          </Button>
          <AddLocationDialog
            parent={node}
            trigger={<Button variant="secondary">{t("addInside")}</Button>}
            onCreated={onSelect}
          />
        </div>
      </form>
      <div className="flex flex-col gap-0.5 border-border border-t pt-3">
        <Button
          variant="danger"
          className="self-start"
          disabled={Boolean(blockedReason) || remove.isPending}
          aria-describedby={blockedReason ? `${node.id}-blocked` : undefined}
          onClick={() => remove.mutate()}
        >
          {t("delete")}
        </Button>
        {blockedReason && (
          <p
            id={`${node.id}-blocked`}
            className="text-[13px] text-ink-muted leading-5"
          >
            {blockedReason}
          </p>
        )}
      </div>
    </>
  );
}

/** A few book spines as a picture of what stands here. */
function Spines({ id, count }: { id: string; count: number }) {
  return (
    <div aria-hidden className="flex items-end gap-[3px]">
      {Array.from({ length: Math.min(count, 7) }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the spines never reorder
          key={i}
          className="w-3.5 rounded-[2px]"
          style={{
            height: 40 + ((i * 5) % 9),
            width: 12 + ((i * 7) % 9),
            background: coverColor(`${id}${i}`),
          }}
        />
      ))}
    </div>
  );
}
