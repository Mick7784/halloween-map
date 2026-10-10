"use client";
import { useEffect } from "react";
const drafts = new Set<symbol>();
export function confirmDraftNavigation() {
  return (
    !drafts.size ||
    window.confirm("Quitter sans enregistrer les modifications ?")
  );
}
export default function useDraftGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol();
    drafts.add(id);
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      drafts.delete(id);
      window.removeEventListener("beforeunload", guard);
    };
  }, [dirty]);
}
