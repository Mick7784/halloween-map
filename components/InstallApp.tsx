"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [installed, setInstalled] = useState(true),
    [ios, setIos] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const check = () =>
      setInstalled(
        media.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    check();
    media.addEventListener("change", check);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const offer = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", check);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    return () => {
      media.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", check);
    };
  }, []);
  if (installed) return null;
  return (
    <>
      <button
        className="install-cta"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          } else setOpen(true);
        }}
      >
        <Download size={18} /> Installer Halloween Map
      </button>
      {open && (
        <div className="modal-backdrop">
          <section
            className="dialog panel install-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
          >
            <button
              className="close"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <h2 id="install-title">Ajouter à mon téléphone</h2>
            <p>
              {ios
                ? "Dans Safari, touchez Partager, puis Ajouter à l’écran d’accueil."
                : "Ouvrez le menu de votre navigateur, puis choisissez Installer l’application ou Ajouter à l’écran d’accueil lorsque cette option est disponible."}
            </p>
            <p className="small muted">
              L’application garde les données personnelles en ligne. La carte
              nécessite une connexion.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
