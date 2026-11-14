import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/ui/field";
import { cn } from "../../lib/cn";
import { type ContactChoice, contactsQuery } from "./queries";

const pill =
  "flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 font-medium text-[15px] md:h-9 md:px-3.5 md:text-sm";

/** The chosen person's name, or undefined while nobody is chosen. */
export function useChosenName(value: ContactChoice | null) {
  const { data: contacts = [] } = useQuery(contactsQuery);
  if (!value) return undefined;
  if ("name" in value) return value.name.trim() || undefined;
  return contacts.find((c) => c.id === value.id)?.name;
}

/** Choose one of the known people or type the name of a new one. */
export function PersonPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContactChoice | null;
  onChange: (value: ContactChoice) => void;
}) {
  const { t } = useTranslation("contacts");
  const { data: contacts = [] } = useQuery(contactsQuery);
  const isNew = value !== null && "name" in value;

  return (
    <div className="flex flex-col gap-2">
      <fieldset>
        <legend className="mb-2 font-semibold text-[13px] leading-[18px]">
          {label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {contacts.map((contact) => {
            const pressed =
              value !== null && "id" in value && value.id === contact.id;
            return (
              <button
                key={contact.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange({ id: contact.id })}
                className={cn(
                  pill,
                  pressed
                    ? "border-ink bg-ink text-white"
                    : "border-control bg-surface text-ink hover:bg-ground",
                )}
              >
                {contact.name}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={isNew}
            onClick={() => onChange({ name: "" })}
            className={cn(
              pill,
              "border-dashed pl-3",
              isNew
                ? "border-ink bg-ink text-white"
                : "border-control bg-surface text-ink hover:bg-ground",
            )}
          >
            <Plus aria-hidden size={16} />
            {t("picker.newPerson")}
          </button>
        </div>
      </fieldset>
      {isNew && (
        <Field
          label={t("picker.newName")}
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          maxLength={100}
          autoComplete="off"
          autoFocus
          required
        />
      )}
    </div>
  );
}
