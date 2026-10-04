"use client";
import { useEffect } from "react";
export function useDialogFocus() {
  useEffect(() => {
    let active: HTMLElement | null = null,
      previous: HTMLElement | null = null;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    function sync() {
      const current = document.querySelector<HTMLElement>('[role="dialog"]');
      if (current === active) return;
      if (active && !current) previous?.focus();
      if (current) {
        previous = document.activeElement as HTMLElement;
        current.querySelector<HTMLElement>(selector)?.focus();
      }
      active = current;
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    function key(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === "Escape") {
        e.preventDefault();
        active.querySelector<HTMLButtonElement>("button.close")?.click();
      }
      if (e.key === "Tab") {
        const list = Array.from(
          active.querySelectorAll<HTMLElement>(selector),
        ).filter((el) => el.getClientRects().length);
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
    document.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key);
    };
  }, []);
}
