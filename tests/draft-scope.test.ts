// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import useDraftGuard, {
  DraftScope,
  confirmDraftNavigation,
  discardDraftScope,
} from "../components/useDraftGuard";

it("isolates the account draft warning from background drafts and disarms only its confirmed deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const host = document.createElement("div"),
    root = createRoot(host),
    account = Symbol("account"),
    other = Symbol("other");
  function Draft({ dirty }: { dirty: boolean }) {
    useDraftGuard(dirty);
    return null;
  }
  try {
    await act(async () =>
      root.render(
        h(DraftScope.Provider, { value: other }, h(Draft, { dirty: true })),
      ),
    );
    expect(confirmDraftNavigation(account)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        h(
          "div",
          null,
          h(DraftScope.Provider, { value: other }, h(Draft, { dirty: true })),
          h(DraftScope.Provider, { value: account }, h(Draft, { dirty: true })),
        ),
      ),
    );
    expect(confirmDraftNavigation(account)).toBe(false);
    discardDraftScope(account);
    expect(confirmDraftNavigation(account)).toBe(true);
    expect(confirmDraftNavigation(other)).toBe(false);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    discardDraftScope(other);
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  } finally {
    await act(async () => root.unmount());
    confirm.mockRestore();
    vi.unstubAllGlobals();
  }
});
