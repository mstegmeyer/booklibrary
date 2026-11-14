import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Select, SelectField } from "../../components/ui/select";
import { formatPath, locationsQuery } from "./queries";

type Props = Omit<ComponentProps<"select">, "children"> & {
  /** Label of the empty choice; without it a location must be picked. */
  noneLabel?: string;
  /** Leaves out this location and everything inside it. */
  exclude?: string;
};

/** Picks a location by its full path. Shows a label when `label` is given. */
export function LocationSelect({
  noneLabel,
  exclude,
  label,
  ...props
}: Props & { label?: string }) {
  const { data: locations = [] } = useQuery(locationsQuery);
  const excluded = new Set(exclude ? [exclude] : []);
  for (const node of locations) {
    if (node.parentId && excluded.has(node.parentId)) excluded.add(node.id);
  }
  const options = (
    <>
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {locations
        .filter((node) => !excluded.has(node.id))
        .map((node) => (
          <option key={node.id} value={node.id}>
            {formatPath(node.path)}
          </option>
        ))}
    </>
  );
  return label ? (
    <SelectField label={label} {...props}>
      {options}
    </SelectField>
  ) : (
    <Select {...props}>{options}</Select>
  );
}
