"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, X } from "lucide-react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = {
  available: boolean;
  ios: boolean;
  safari: boolean;
  install: () => Promise<boolean>;
};
const InstallContext = createContext<InstallState | null>(null);

// Keep listening while the drawer is closed: beforeinstallprompt can fire once.
export function InstallAppProvider({ children }: { children: ReactNode }) {
  const pending = useRef<InstallEvent | null>(null);
  const [offered, setOffered] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);
  const [safari, setSafari] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const check = () =>
      setInstalled(
        media.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    check();
    media.addEventListener("change", check);
    const ua = navigator.userAgent;
    setIos(
      /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    setSafari(/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua));
    const offer = (event: Event) => {
      event.preventDefault();
      pending.current = event as InstallEvent;
      setOffered(true);
    };
    const complete = () => {
      pending.current = null;
      setOffered(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);
    if (window.isSecureContext && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    return () => {
      media.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  const install = async () => {
    const event = pending.current;
    if (!event) return false;
    pending.current = null;
    // A native prompt is single-use. Retain the button only for an iOS guide.
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      return true;
    } finally {
      setOffered(false);
    }
  };
  return (
    <InstallContext.Provider
      value={{
        available: !installed && (offered || ios),
        ios,
        safari,
        install,
      }}
    >
      {children}
    </InstallContext.Provider>
  );
}

export default function InstallApp() {
  const state = useContext(InstallContext);
  const [help, setHelp] = useState("");
  const [busy, setBusy] = useState(false);
  if (!state || (!state.available && !help)) return null;
  return (
    <div className="install-action">
      {state.available && (
        <button
          className="install-cta"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setHelp("");
            try {
              if (!(await state.install()))
                setHelp(
                  state.safari
                    ? "Touchez Partager puis « Sur l’écran d’accueil »."
                    : "Ouvrez cette page dans Safari, puis touchez Partager et « Sur l’écran d’accueil ».",
                );
            } catch {
              setHelp(
                "L’installation n’a pas pu démarrer. Réessayez depuis le menu de votre navigateur si l’option Installer l’application est proposée.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={18} />
          <span>Ajouter l’application</span>
        </button>
      )}
      {help && (
        <section
          className="install-help"
          aria-label="Ajouter à l’écran d’accueil"
        >
          <button
            className="install-help-close"
            aria-label="Fermer l’aide à l’installation"
            onClick={() => setHelp("")}
          >
            <X size={16} />
          </button>
          <strong>Ajouter à l’écran d’accueil</strong>
          <p role="status">{help}</p>
        </section>
      )}
    </div>
  );
}
