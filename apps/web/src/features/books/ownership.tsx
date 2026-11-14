import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { PersonPicker } from "../contacts/person-picker";
import type { ContactChoice } from "../contacts/queries";
import { LocationSelect } from "../locations/location-select";
import { todayIso } from "../reading/queries";

export const ownershipKinds = ["library", "borrowed", "reading-list"] as const;
export type OwnershipKind = (typeof ownershipKinds)[number];

export type Ownership = {
  kind: OwnershipKind;
  locationId: string;
  person: ContactChoice | null;
};

/** The ownership as the API takes it when adding a book. */
export function ownershipJson(ownership: Ownership) {
  if (ownership.kind === "borrowed" && ownership.person) {
    const person = ownership.person;
    return {
      borrowedFrom: "name" in person ? { name: person.name.trim() } : person,
      // The loan starts on the reader's day, not the server's.
      borrowedOn: todayIso(),
    };
  }
  if (ownership.kind === "reading-list") return { wantToRead: true };
  return { copy: { locationId: ownership.locationId || null } };
}

// One set of radios: a segmented control on phones (as on the scan board),
// rows with the picker beside each choice from `sm` up (as on the add board),
// where the segments' wrapper dissolves into the rows' grid.
const segment =
  "relative flex cursor-pointer items-center gap-2.5 text-sm leading-5 max-sm:h-11 max-sm:justify-center max-sm:rounded-lg max-sm:px-1 max-sm:text-center max-sm:font-medium max-sm:text-[13px] max-sm:text-ink-nav max-sm:leading-4 max-sm:has-[:checked]:bg-surface max-sm:has-[:checked]:font-semibold max-sm:has-[:checked]:text-ink max-sm:has-[:focus-visible]:outline-2 max-sm:has-[:focus-visible]:outline-accent sm:min-h-10";

/** "This book is": in our library, borrowed from someone, or only wanted. */
export function OwnershipFieldset({
  value,
  onChange,
}: {
  value: Ownership;
  onChange: (value: Ownership) => void;
}) {
  const { t } = useTranslation("books");
  const choice = (kind: OwnershipKind, short: string, long: string) => (
    <label
      className={cn(
        segment,
        kind === "library" && "sm:row-start-1",
        kind === "borrowed" && "sm:row-start-2",
        kind === "reading-list" && "sm:col-span-2 sm:row-start-3",
      )}
    >
      <input
        type="radio"
        name="ownership"
        checked={value.kind === kind}
        onChange={() => onChange({ ...value, kind })}
        className="size-[18px] shrink-0 accent-accent max-sm:absolute max-sm:inset-0 max-sm:size-full max-sm:cursor-pointer max-sm:opacity-0"
      />
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{long}</span>
    </label>
  );

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-semibold text-[13px] leading-[18px]">
        {t("add.thisBookIs")}
      </legend>
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-x-3 sm:gap-y-2">
        <div className="grid grid-cols-3 gap-0.5 rounded-[11px] bg-[#eceee9] p-[3px] sm:contents">
          {choice("library", t("add.inLibrary"), t("add.inLibrary"))}
          {choice("borrowed", t("add.borrowedShort"), t("add.borrowedFrom"))}
          {choice(
            "reading-list",
            t("add.readingListShort"),
            t("add.readingList"),
          )}
        </div>
        <LocationSelect
          aria-label={t("add.shelf")}
          noneLabel={t("add.noLocation")}
          value={value.locationId}
          disabled={value.kind !== "library"}
          onChange={(event) =>
            onChange({ ...value, locationId: event.target.value })
          }
          className={cn(
            "w-full sm:col-start-2 sm:row-start-1",
            value.kind !== "library" && "max-sm:hidden",
          )}
        />
        {value.kind === "borrowed" && (
          <div className="sm:col-start-2 sm:row-start-2">
            <PersonPicker
              label={t("add.person")}
              value={value.person}
              onChange={(person) => onChange({ ...value, person })}
            />
          </div>
        )}
        {value.kind === "reading-list" && (
          <p className="flex min-h-14 items-center rounded-xl bg-sidebar px-3.5 text-ink-nav text-sm leading-5 sm:hidden">
            {t("add.readingListHint")}
          </p>
        )}
      </div>
    </fieldset>
  );
}
