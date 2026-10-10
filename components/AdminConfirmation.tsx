"use client";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Input, Button, Dialog } from "./ui";
import type { SensitiveAction } from "../lib/sensitive-actions";

export class ActionCancelled extends Error {
  constructor() {
    super("Action annulée. Aucune modification effectuée.");
  }
}
export function AdminConfirmation({
  options,
  onConfirm,
  onCancel,
}: {
  options: SensitiveAction;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState(""),
    [phrase, setPhrase] = useState("");
  return (
    <div className="modal-backdrop admin-confirmation-backdrop">
      <Dialog
        title="Confirmer l’action sensible"
        className="dialog panel admin-confirmation"
        aria-describedby="admin-confirmation-description"
      >
        <p id="admin-confirmation-description">{options.message}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password && (!options.phrase || phrase === options.phrase))
              onConfirm(password);
          }}
        >
          {options.phrase && (
            <label className="field">
              <span>Recopiez « {options.phrase} »</span>
              <Input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                required
                aria-label="Confirmation de l’opération"
              />
            </label>
          )}
          <label className="field">
            <span>Mot de passe</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={128}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="actions">
            <Button
              type="button"
              className="close"
              aria-label="Annuler"
              onClick={onCancel}
            >
              Annuler
            </Button>
            <Button
              variant={options.danger ? "danger" : "primary"}
              disabled={
                !password || (!!options.phrase && phrase !== options.phrase)
              }
            >
              Confirmer
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
export function requestAdminConfirmation(
  options: SensitiveAction = {
    message: "Cette opération nécessite votre mot de passe actuel.",
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    document.body.append(host);
    // A portalled confirmation inherits the current theme, including nested admin dialogs.
    host.dataset.theme =
      document.querySelector(".admin-beta")?.getAttribute("data-theme") ??
      document.documentElement.getAttribute("data-theme") ??
      "system";
    const root = createRoot(host);
    let finished = false;
    function finish(password?: string) {
      if (finished) return;
      finished = true;
      root.unmount();
      host.remove();
      if (password) resolve(password);
      else reject(new ActionCancelled());
    }
    root.render(
      <AdminConfirmation
        options={options}
        onConfirm={finish}
        onCancel={() => finish()}
      />,
    );
  });
}
