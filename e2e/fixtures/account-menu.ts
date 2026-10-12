import { expect, type Page } from "@playwright/test";

export async function expandAccountGroup(page: Page, name: string) {
  const toggle = page.getByRole("button", { name, exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

export async function clickAccountAction(page: Page, name: string | RegExp) {
  const action = page.getByRole("button", {
    name,
    exact: typeof name === "string",
  });
  if (!(await action.isVisible())) {
    const text = String(name);
    const group = /participation|années/.test(text)
      ? "Mes participations"
      : /application/.test(text)
        ? "Aide et application"
        : "Profil et sécurité";
    await expandAccountGroup(page, group);
  }
  await action.click();
}
