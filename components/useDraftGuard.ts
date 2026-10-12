"use client";
import { createContext, useContext, useEffect } from "react";
export const DraftScope = createContext<symbol | undefined>(undefined);
const drafts = new Map<symbol, symbol | undefined>();
export function discardDraftScope(scope?: symbol) {
  if (!scope) {
    drafts.clear();
    return;
  }
  for (const [id, owner] of drafts) if (owner === scope) drafts.delete(id);
}
export function confirmDraftNavigation(scope?: symbol) {
  return (
    !(scope ? [...drafts.values()].includes(scope) : drafts.size) ||
    window.confirm("Quitter sans enregistrer les modifications ?")
  );
}
export default function useDraftGuard(dirty: boolean) {
  const scope = useContext(DraftScope);
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol();
    drafts.set(id, scope);
    const guard = (event: BeforeUnloadEvent) => {
      if (!drafts.has(id)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      drafts.delete(id);
      window.removeEventListener("beforeunload", guard);
    };
  }, [dirty, scope]);
}
