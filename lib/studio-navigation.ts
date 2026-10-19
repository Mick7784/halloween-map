/**
 * Portable DomotiK Studio navigation primitives.
 * The product owns its entries and permission grants; no authentication,
 * DOM, React or domain-specific behavior is hidden inside this module.
 */
export type StudioNavItem<Id extends string = string, Icon extends string = string> = {
  id: Id;
  title: string;
  permission: string;
  icon: Icon;
};
export type StudioNavGroup<Id extends string = string, Icon extends string = string> = {
  title: string;
  items: readonly StudioNavItem<Id, Icon>[];
};
export function visibleStudioNavigation<Item extends StudioNavItem>(
  groups: readonly { title: string; items: readonly Item[] }[],
  allowed: (permission: string) => boolean,
): { title: string; items: Item[] }[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => allowed(item.permission));
    return items.length ? [{ title: group.title, items }] : [];
  });
}
