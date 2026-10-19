/**
 * Portable DomotiK Studio navigation primitives.
 * The product owns its entries and permission grants; no authentication,
 * DOM, React or domain-specific behavior is hidden inside this module.
 */
export type StudioNavItem<Id extends string = string> = {
  id: Id;
  title: string;
  permission: string;
  icon: string;
};
export type StudioNavGroup<Id extends string = string> = {
  title: string;
  items: readonly StudioNavItem<Id>[];
};
export type VisibleStudioNavGroup<Id extends string = string> = {
  title: string;
  items: StudioNavItem<Id>[];
};
export function visibleStudioNavigation<Id extends string>(
  groups: readonly StudioNavGroup<Id>[],
  allowed: (permission: string) => boolean,
): VisibleStudioNavGroup<Id>[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => allowed(item.permission));
    return items.length ? [{ title: group.title, items }] : [];
  });
}
