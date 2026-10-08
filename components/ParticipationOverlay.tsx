"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowLeft,
  Candy,
  Clock3,
  Power,
  Trash2,
  CheckCircle2,
  Play,
} from "lucide-react";
import type { House, User } from "../lib/domain";
import type { PublicState } from "./common";
import { api, Notice } from "./common";
import { participationStatus } from "../lib/participation-settings";
import ParticipationForm from "./ParticipationForm";
import ManorMark from "./ManorMark";
import "./ParticipationOverlay.css";
type Confirmation = "candy" | "end" | "delete" | null;
export default function ParticipationOverlay({
  user,
  state,
  refresh,
  onClose,
  styleUrl,
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
  onClose: () => void;
  styleUrl: string;
}) {
  const [house, setHouse] = useState<House | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<Confirmation>(null),
    [busy, setBusy] = useState(false),
    [closing, setClosing] = useState(false),
    [generation, setGeneration] = useState(0);
  const schedule = useRef<HTMLElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let active = true;
    void api<House | null>("house")
      .then((h) => {
        if (active) {
          setHouse(h);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      onClose,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200,
    );
  }
  async function reload() {
    setHouse(await api<House | null>("house"));
    await refresh();
  }
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await api("participant", { action, ...extra });
      await reload();
      setConfirmation(null);
      if (action === "delete") close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const status = house ? participationStatus(house) : null,
    season = state.season,
    instance = state.instance;
  const canEdit =
    !!season &&
    !["CLOSED", "ARCHIVED"].includes(state.state ?? "") &&
    user.email_status === "VERIFIED";
  return (
    <div className={"participation-overlay" + (closing ? " is-closing" : "")}>
      <section
        className="participation-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-labelledby="participation-title"
      >
        <header className="participation-header" inert={!!confirmation}>
          <span className="participation-brand">
            <ManorMark />
          </span>
          <div>
            <h1 id="participation-title">
              {house ? "Ma participation" : "Inscrire ma maison"}
            </h1>
            <p>
              {house
                ? "Modifiez les informations de votre maison"
                : "Ajoutez votre maison et partagez la magie d’Halloween."}
            </p>
          </div>
          <button
            className="close participation-close"
            aria-label="Fermer ma participation"
            onClick={close}
          >
            <X />
          </button>
        </header>
        <div className="participation-scroll" inert={!!confirmation}>
          <Notice error={error} />
          {!loaded ? (
            <p role="status">
              {error
                ? "Votre participation n’a pas pu être chargée."
                : "Chargement de votre participation…"}
            </p>
          ) : (
            <>
              {house && (
                <div className="participation-management">
                  <div className="participation-status">
                    <span
                      className={"participation-status-badge " + status!.tone}
                    >
                      <CheckCircle2 size={14} />
                      {status!.label}
                    </span>
                    <p>
                      {house.activity === "ENDED"
                        ? "Votre accueil est terminé. Votre participation est conservée."
                        : house.activity === "PAUSED"
                          ? "Votre accueil est en pause."
                          : house.status === "VISIBLE"
                            ? "Votre maison sera proposée aux visiteurs pendant vos horaires d’accueil."
                            : "Votre participation est conservée ; la maison n’est pas proposée aux visiteurs."}
                    </p>
                  </div>
                  <div className="participation-quick-actions">
                    {house.activities.includes("CANDY") &&
                      !house.candy_available &&
                      house.activity !== "ENDED" &&
                      canEdit && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action("candy", { available: true })
                          }
                        >
                          <Candy />
                          <span>J’ai de nouveau des bonbons</span>
                        </button>
                      )}
                    {house.activities.includes("CANDY") &&
                      house.candy_available &&
                      house.activity !== "ENDED" &&
                      canEdit && (
                        <button onClick={() => setConfirmation("candy")}>
                          <Candy />
                          <span>Je n’ai plus de bonbons</span>
                        </button>
                      )}
                    {canEdit && (
                      <button
                        onClick={() => {
                          schedule.current?.scrollIntoView({
                            behavior: window.matchMedia(
                              "(prefers-reduced-motion: reduce)",
                            ).matches
                              ? "instant"
                              : "smooth",
                            block: "center",
                          });
                          schedule.current
                            ?.querySelector<HTMLInputElement>("input")
                            ?.focus({ preventScroll: true });
                        }}
                      >
                        <Clock3 />
                        <span>Modifier mes horaires</span>
                      </button>
                    )}
                    {house.activity !== "ENDED" && canEdit && (
                      <button onClick={() => setConfirmation("end")}>
                        <Power />
                        <span>Terminer mon activité</span>
                      </button>
                    )}
                    {house.activity === "PAUSED" && canEdit && (
                      <button
                        disabled={busy}
                        onClick={() => void action("resume")}
                      >
                        <Play />
                        <span>Reprendre mon accueil</span>
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={() => setConfirmation("delete")}
                    >
                      <Trash2 />
                      <span>Supprimer ma participation</span>
                    </button>
                  </div>
                </div>
              )}
              {!house && !season?.registrations_open ? (
                <p className="notice info">
                  Les inscriptions sont fermées. Votre compte reste disponible
                  pour la prochaine édition.
                </p>
              ) : !canEdit ? (
                <p className="notice info">
                  {user.email_status !== "VERIFIED"
                    ? "Vérifiez votre email depuis Mon compte avant de participer."
                    : "La saison est fermée ; les informations de votre participation sont conservées jusqu’à la purge."}
                </p>
              ) : (
                instance &&
                season && (
                  <ParticipationForm
                    key={(house?.id ?? "create") + generation}
                    house={house ?? undefined}
                    zone={instance.timezone}
                    opens={season.opens_at}
                    closes={season.closes_at}
                    center={[instance.longitude, instance.latitude]}
                    styleUrl={styleUrl}
                    isTest={season.is_test}
                    settings={state.participation}
                    documents={state.documents}
                    scheduleRef={schedule}
                    onSave={async (payload) => {
                      await api(house ? "house" : "participation", payload);
                      await reload();
                      if (!house) setGeneration((n) => n + 1);
                    }}
                  />
                )
              )}
            </>
          )}
          {error && !loaded && (
            <button
              onClick={() =>
                void api<House | null>("house")
                  .then((h) => {
                    setHouse(h);
                    setLoaded(true);
                    setError("");
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Réessayer
            </button>
          )}
        </div>
        {confirmation && (
          <div className="participation-confirm-backdrop">
            <section
              className="participation-confirm"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
              aria-modal="true"
              aria-labelledby="participation-confirm-title"
            >
              <button
                className="close"
                aria-label="Fermer ma participation"
                onClick={close}
                disabled={busy}
              >
                <X />
              </button>
              <button
                type="button"
                className="floating-back"
                aria-label="Revenir à ma participation"
                onClick={() => setConfirmation(null)}
                disabled={busy}
              >
                <ArrowLeft />
              </button>
              <h2 id="participation-confirm-title">
                {confirmation === "candy"
                  ? "Vous n’avez plus de bonbons ?"
                  : confirmation === "end"
                    ? "Terminer votre activité ?"
                    : "Supprimer votre participation ?"}
              </h2>
              <p>
                {confirmation === "delete"
                  ? "La maison et les données de cette participation seront supprimées définitivement. Votre compte reste disponible."
                  : "Fermer votre maison la retire de la carte active et des nouveaux parcours. Votre participation reste enregistrée."}
              </p>
              <Notice error={error} />
              <div className="participation-confirm-actions">
                {confirmation === "candy" &&
                  house?.activities.includes("ACTING") && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void action("deplete", { choice: "continue" })
                      }
                    >
                      Continuer à accueillir sans bonbons
                    </button>
                  )}
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      confirmation === "delete"
                        ? "delete"
                        : confirmation === "candy"
                          ? "deplete"
                          : "end",
                      confirmation === "delete"
                        ? { confirm: "SUPPRIMER" }
                        : confirmation === "candy"
                          ? { choice: "close" }
                          : {},
                    )
                  }
                >
                  {confirmation === "delete"
                    ? "Supprimer définitivement"
                    : confirmation === "candy"
                      ? "Fermer ma maison"
                      : "Terminer mon activité"}
                </button>
                <button disabled={busy} onClick={() => setConfirmation(null)}>
                  Annuler
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
