"use client";
import { useRef, useState, type ReactNode } from "react";
import {
  Candy,
  Drama,
  Ghost,
  House as HouseIcon,
  Clock3,
  MapPin,
  Info,
  Save,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { House, Activity } from "../lib/domain";
import type { LegalDocument, LegalKind } from "../lib/content";
import {
  publicParticipationSettings,
  formatAddress,
  parseStoredAddress,
} from "../lib/participation-settings";
import type { ParticipationSettings } from "../lib/participation-settings";
import HouseLocation, { type LocationValue } from "./HouseLocation";
import { localDate, Notice } from "./common";
import Editorial from "./Editorial";
import { legalDefaults } from "../lib/legal-defaults";
const activityItems = {
  DECORATION: { label: "Décoration", icon: <Sparkles /> },
  CANDY: { label: "Bonbons", icon: <Candy /> },
  ACTING: { label: "Mise en scène", icon: <Drama /> },
};
export default function ParticipationForm({
  house,
  zone,
  opens,
  closes,
  center,
  styleUrl,
  settings: source,
  documents,
  scheduleRef,
  onSave,
}: {
  house?: House;
  zone: string;
  opens: string;
  closes: string;
  center: [number, number];
  styleUrl: string;
  settings?: ParticipationSettings;
  documents?: Record<LegalKind, LegalDocument>;
  scheduleRef: React.RefObject<HTMLElement | null>;
  onSave: (payload: unknown) => Promise<void>;
}) {
  const settings = publicParticipationSettings(source);
  const blank = {
    postalCode: "",
    city: "",
    cityCode: "",
    number: "",
    street: "",
  };
  const initial = useRef<LocationValue>({
    address:
      house?.address_parts ??
      (house ? parseStoredAddress(house.address) : blank),
    point: house ? [Number(house.longitude), Number(house.latitude)] : null,
    confirmed: !!house?.address_parts,
  });
  const [location, setLocation] = useState(initial.current),
    [name, setName] = useState(house?.name ?? ""),
    [activities, setActivities] = useState<Activity[]>(
      house?.activities ?? ["DECORATION"],
    ),
    [adapt, setAdapt] = useState(house?.adaptable ?? false),
    [fear, setFear] = useState(house?.fear ?? 2),
    [rp, setRp] = useState(house?.rp ?? ""),
    [practical, setPractical] = useState(house?.practical ?? ""),
    [starts, setStarts] = useState(
      house ? localDate(house.starts_at, zone) : localDate(opens, zone),
    ),
    [ends, setEnds] = useState(
      house ? localDate(house.ends_at, zone) : localDate(closes, zone),
    ),
    [guidelines, setGuidelines] = useState(false),
    [guidelinesOpen, setGuidelinesOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const acceptanceNeeded =
    !house ||
    (documents?.TERMS.requires_reaccept &&
      (house as House & { terms_version?: string }).terms_version !==
        documents.TERMS.version) ||
    (documents?.GUIDELINES.requires_reaccept &&
      (house as House & { guidelines_version?: string }).guidelines_version !==
        documents.GUIDELINES.version);
  const guidelinesDocument = documents?.GUIDELINES ?? {
    ...legalDefaults.GUIDELINES,
    version: "2026.1",
  };
  function section(
    n: number,
    title: string,
    icon: ReactNode,
    children: ReactNode,
    className = "",
  ) {
    return (
      <section className={"participation-section " + className}>
        <h2>
          <span className="participation-step">{n}</span>
          {icon}
          {title}
        </h2>
        {children}
      </section>
    );
  }
  return (
    <form
      id="participation-form"
      className="participation-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSaved(false);
        if (!location.confirmed || !location.point) {
          setError("Vérifiez et confirmez le point de votre maison.");
          return;
        }
        if (!activities.length) {
          setError("Choisissez au moins une activité.");
          return;
        }
        if (rp.length > settings.descriptionLimit) {
          setError(
            `Raccourcissez la description à ${settings.descriptionLimit} caractères.`,
          );
          return;
        }
        if (acceptanceNeeded && !guidelines) {
          setError(
            "Prenez connaissance des bonnes pratiques avant de participer.",
          );
          return;
        }
        setBusy(true);
        try {
          const h = {
            name,
            address: formatAddress(location.address),
            address_parts: location.address,
            latitude: location.point[1],
            longitude: location.point[0],
            position_confirmed: location.confirmed,
            activities,
            starts_at: starts,
            ends_at: ends,
            fear,
            adaptable: adapt,
            rp,
            practical,
          };
          const acceptance = {
            mode: "GUIDELINES_ONLY",
            guidelines,
            guidelines_version: guidelinesDocument.version,
          };
          await onSave(
            house
              ? { ...h, ...(acceptanceNeeded ? { acceptance } : {}) }
              : { house: h, acceptance },
          );
          setSaved(true);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="participation-form-grid" inert={guidelinesOpen}>
        {section(
          1,
          "Localisation de la maison",
          <MapPin />,
          <HouseLocation
            initial={initial.current}
            legacyAddress={house?.address}
            center={center}
            styleUrl={styleUrl}
            allowedCommuneCodes={settings.allowedCommuneCodes}
            onChange={setLocation}
          />,
          "participation-location-section",
        )}
        {section(
          2,
          "Nom de la maison *",
          <HouseIcon />,
          <label className="field">
            <span className="visually-hidden">Nom de la maison *</span>
            <input
              name="name"
              maxLength={100}
              required
              placeholder="Ma Maison Hantée"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>,
        )}
        {section(
          3,
          "Activités proposées",
          <Sparkles />,
          <div
            className="participation-activities"
            role="group"
            aria-label="Activités proposées"
          >
            {Array.from(
              new Set([...settings.activities, ...(house?.activities ?? [])]),
            ).map((a) => (
              <label
                key={a}
                className={activities.includes(a) ? "is-selected" : ""}
              >
                {activityItems[a].icon}
                <span>{activityItems[a].label}</span>
                <input
                  type="checkbox"
                  name={a}
                  checked={activities.includes(a)}
                  onChange={(e) => {
                    setActivities(
                      e.target.checked
                        ? [...activities, a]
                        : activities.filter((x) => x !== a),
                    );
                    setSaved(false);
                  }}
                />
              </label>
            ))}
          </div>,
        )}
        <section
          className="participation-section participation-schedule"
          ref={scheduleRef}
          tabIndex={-1}
        >
          <h2>
            <span className="participation-step">4</span>
            <Clock3 />
            Horaires d’accueil
          </h2>
          <div className="participation-address-grid">
            <label className="field">
              <span>Début *</span>
              <input
                name="starts_at"
                type="datetime-local"
                required
                min={localDate(opens, zone)}
                max={localDate(closes, zone)}
                value={starts}
                onChange={(e) => {
                  setStarts(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="field">
              <span>Fin *</span>
              <input
                name="ends_at"
                type="datetime-local"
                required
                min={starts || localDate(opens, zone)}
                max={localDate(closes, zone)}
                value={ends}
                onChange={(e) => {
                  setEnds(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
          <small className="participation-help">
            Horaires de l’édition · {zone}
          </small>
        </section>
        {section(
          5,
          "Niveau de frayeur",
          <Ghost />,
          <>
            <div
              className={"participation-fear" + (adapt ? " is-disabled" : "")}
            >
              <input
                aria-label="Niveau de frayeur"
                type="range"
                min={1}
                max={5}
                value={fear}
                disabled={adapt}
                onChange={(e) => {
                  setFear(Number(e.target.value));
                  setSaved(false);
                }}
              />
              <div className="participation-fear-labels">
                {settings.fearLabels.map((label, n) => (
                  <span
                    key={n}
                    className={fear === n + 1 && !adapt ? "selected" : ""}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <label className="participation-adapt">
              <Ghost size={22} />
              <span>Je m’adapte à mes visiteurs</span>
              <input
                type="checkbox"
                role="switch"
                checked={adapt}
                onChange={(e) => {
                  setAdapt(e.target.checked);
                  setSaved(false);
                }}
              />
              <span className="participation-toggle" aria-hidden="true" />
            </label>
            <small className="participation-help">
              {adapt
                ? "L’expérience s’adapte à vos visiteurs ; le niveau fixe est désactivé."
                : "Activez ce mode pour adapter la frayeur à vos visiteurs."}
            </small>
          </>,
        )}
        {section(
          6,
          "Description / ambiance",
          <Ghost />,
          <label className="field">
            <span>Facultatif</span>
            <textarea
              name="rp"
              rows={3}
              maxLength={settings.descriptionLimit}
              placeholder="Décrivez en quelques mots l’ambiance de votre maison, votre décoration ou ce que les visiteurs vont découvrir…"
              value={rp}
              onChange={(e) => {
                setRp(e.target.value);
                setSaved(false);
              }}
            />
            <small
              className={
                rp.length > settings.descriptionLimit
                  ? "participation-over-limit"
                  : "participation-counter"
              }
            >
              {rp.length} / {settings.descriptionLimit}
            </small>
          </label>,
          "participation-description",
        )}
        {section(
          7,
          "Infos pratiques",
          <Info />,
          <label className="field">
            <span>Facultatif</span>
            <textarea
              name="practical"
              rows={3}
              maxLength={settings.practicalLimit}
              placeholder="Ex. : Portail blanc, au fond de la cour, entrée côté jardin…"
              value={practical}
              onChange={(e) => {
                setPractical(e.target.value);
                setSaved(false);
              }}
            />
          </label>,
          "participation-practical",
        )}
        {acceptanceNeeded && (
          <section className="participation-section participation-consent">
            <label className="check">
              <input
                type="checkbox"
                checked={guidelines}
                onChange={(e) => setGuidelines(e.target.checked)}
              />
              <span>
                J’ai pris connaissance des{" "}
                <button
                  type="button"
                  className="participation-guidelines-link"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    e.preventDefault();
                    setGuidelinesOpen(true);
                  }}
                >
                  bonnes pratiques
                </button>
              </span>
            </label>
          </section>
        )}
      </div>
      <div className="participation-submit" inert={guidelinesOpen}>
        <Notice error={error} />
        {saved && (
          <p role="status" className="participation-success">
            Modifications enregistrées.
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy || !location.confirmed || (!!acceptanceNeeded && !guidelines)
          }
        >
          {house ? <Save size={18} /> : <Send size={18} />}{" "}
          {busy
            ? "Enregistrement…"
            : house
              ? "Enregistrer les modifications"
              : "Envoyer ma participation"}
        </button>
      </div>
      {guidelinesOpen && (
        <div className="participation-guidelines-backdrop">
          <section
            className="participation-guidelines-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="participation-guidelines-title"
          >
            <button
              type="button"
              className="close"
              aria-label="Fermer les bonnes pratiques"
              onClick={() => setGuidelinesOpen(false)}
            >
              <X />
            </button>
            <h2 id="participation-guidelines-title">Bonnes pratiques</h2>
            <Editorial
              text={guidelinesDocument.body || legalDefaults.GUIDELINES.body}
            />
            <button
              type="button"
              className="participation-guidelines-return"
              onClick={() => setGuidelinesOpen(false)}
            >
              Retour au formulaire
            </button>
          </section>
        </div>
      )}
    </form>
  );
}
