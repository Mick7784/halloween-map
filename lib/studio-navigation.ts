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
export function visibleStudioNavigation<const Groups extends readonly StudioNavGroup[]>(
  groups: Groups,
  allowed: (permission: string) => boolean,
): { title: string; items: Groups[number]["items"][number][] }[] {
  return groups.flatMap((group) => {
    const items: Groups[number]["items"][number][] = group.items.filter(
      (item) => allowed(item.permission),
    );
    return items.length ? [{ title: group.title, items }] : [];
  });
}
