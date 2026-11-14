/**
 * One entry per translation namespace. Each English file in
 * `src/locales/en/` adds its own entry, so features never edit a shared file.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface Namespaces {}

/** The shape every other language must match for a namespace. */
export type Translation<NS extends keyof Namespaces> = Namespaces[NS];

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: Namespaces;
  }
}
