"use client";
import { useEffect } from "react";
export function useDialogFocus() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    const origins = new Map<HTMLElement, HTMLElement>();
    const background = new Map<
      HTMLElement,
      { inert: boolean; aria: string | null }
    >();
    function restoreBackground() {
      for (const [element, previous] of background) {
        // Pre-existing locks belong to React/the parent overlay, which may
        // have released them while this dialog was closing.
        if (!previous.inert) element.inert = false;
        if (previous.aria === null) element.removeAttribute("aria-hidden");
        else if (previous.aria !== "true")
          element.setAttribute("aria-hidden", previous.aria);
      }
      background.clear();
    }
    function isolate(dialog: HTMLElement) {
      let branch: HTMLElement = dialog;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (
            !(sibling instanceof HTMLElement) ||
            sibling === branch ||
            ["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)
          )
            continue;
          background.set(sibling, {
            inert: sibling.inert,
            aria: sibling.getAttribute("aria-hidden"),
          });
          sibling.inert = true;
          sibling.setAttribute("aria-hidden", "true");
        }
        if (branch.parentElement === document.body) break;
        branch = branch.parentElement;
      }
    }
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    const visible = (el: HTMLElement) =>
      !el.closest("[inert],[hidden]") && !!el.getClientRects().length;
    function sync() {
      if (active && !active.isConnected) restoreBackground();
      const current =
        Array.from(
          document.querySelectorAll<HTMLElement>('[role="dialog"]'),
        ).findLast(visible) ?? null;
      if (current === active) return;
      const origin = active ? origins.get(active) : null;
      restoreBackground();
      if (current) {
        if (!origins.has(current))
          origins.set(
            current,
            active && !active.isConnected && origin?.isConnected
              ? origin
              : (document.activeElement as HTMLElement),
          );
        const saved =
          origin?.isConnected && current.contains(origin) ? origin : null;
        (
          saved ??
          Array.from(current.querySelectorAll<HTMLElement>(selector)).find(
            visible,
          )
        )?.focus({ preventScroll: true });
        isolate(current);
      } else if (origin?.isConnected) origin.focus({ preventScroll: true });
      for (const dialog of origins.keys())
        if (!dialog.isConnected) origins.delete(dialog);
      active = current;
    }
    function close() {
      active
        ?.querySelector<HTMLButtonElement>(
          'button.close,button[data-dialog-close],button[aria-label^="Fermer"],button[aria-label^="Annuler la purge"]',
        )
        ?.click();
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["inert", "hidden"],
    });
    sync();
    function click(e: MouseEvent) {
      // Only the actual backdrop closes a dialog, never a child of the panel.
      if (active && e.target === active.parentElement) close();
    }
    function key(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const list = Array.from(
          active.querySelectorAll<HTMLElement>(selector),
        ).filter(visible);
        const first = list[0],
          last = list.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !active.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !active.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      restoreBackground();
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
}
