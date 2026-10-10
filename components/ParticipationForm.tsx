"use client";
import { Input, Button, Dialog } from "./ui";
import { useRef, useState, type ReactNode } from "react";
import {
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
} from "../lib/participation-settings";
import type { ParticipationSettings } from "../lib/participation-settings";
import HouseLocation from "./HouseLocation";
import {
  initialHouseLocation,
  validateHouseForm,
  houseScheduleBounds,
} from "../lib/house-form";
import {
  HouseNameField,
  HouseActivityFields,
  HouseScheduleFields,
  HouseFearFields,
  HouseTextField,
} from "./HouseFields";
import { localDate, Notice } from "./common";
import Editorial from "./Editorial";
import { legalDefaults } from "../lib/legal-defaults";
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
  submitLabel,
  isTest = false,
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
  submitLabel?: string;
  isTest?: boolean;
}) {
  const settings = publicParticipationSettings(source);
  const initial = useRef(initialHouseLocation(house));
  const schedule = houseScheduleBounds(opens, closes, zone);
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
      house ? localDate(house.starts_at, zone) : schedule.starts,
    ),
    [ends, setEnds] = useState(
      house ? localDate(house.ends_at, zone) : schedule.ends,
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
        if (acceptanceNeeded && !guidelines) {
          setError(
            "Prenez connaissance des bonnes pratiques avant de participer.",
          );
          return;
        }
        setBusy(true);
        try {
          const h = validateHouseForm(
            {
              name,
              address: formatAddress(location.address),
              address_parts: location.address,
              latitude: location.point?.[1],
              longitude: location.point?.[0],
              position_confirmed: location.confirmed,
              activities,
              starts_at: starts,
              ends_at: ends,
              fear,
              adaptable: adapt,
              rp,
              practical,
            },
            { zone, opens, closes, isTest, settings },
          );
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
        {house?.review_status === "VALIDATED" && (
          <p className="notice info">
            Les changements d’adresse, de position, d’horaires ou de
            participation entraînent une nouvelle validation de votre maison.
          </p>
        )}
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
          <HouseNameField
            value={name}
            onChange={(v) => {
              setName(v);
              setSaved(false);
            }}
          />,
        )}
        {section(
          3,
          "Activités proposées",
          <Sparkles />,
          <HouseActivityFields
            value={activities}
            options={Array.from(
              new Set([...settings.activities, ...(house?.activities ?? [])]),
            )}
            onChange={(v) => {
              setActivities(v);
              setSaved(false);
            }}
          />,
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
          <HouseScheduleFields
            starts={starts}
            ends={ends}
            zone={zone}
            opens={opens}
            closes={closes}
            isTest={isTest}
            onStart={(v) => {
              setStarts(v);
              setSaved(false);
            }}
            onEnd={(v) => {
              setEnds(v);
              setSaved(false);
            }}
          />
        </section>
        {section(
          5,
          "Niveau de frayeur",
          <Ghost />,
          <HouseFearFields
            fear={fear}
            adapt={adapt}
            labels={settings.fearLabels}
            onFear={(v) => {
              setFear(v);
              setSaved(false);
            }}
            onAdapt={(v) => {
              setAdapt(v);
              setSaved(false);
            }}
          />,
        )}
        {section(
          6,
          "Description / ambiance",
          <Ghost />,
          <HouseTextField
            name="rp"
            value={rp}
            limit={settings.descriptionLimit}
            onChange={(v) => {
              setRp(v);
              setSaved(false);
            }}
          />,
          "participation-description",
        )}
        {section(
          7,
          "Infos pratiques",
          <Info />,
          <HouseTextField
            name="practical"
            value={practical}
            limit={settings.practicalLimit}
            onChange={(v) => {
              setPractical(v);
              setSaved(false);
            }}
          />,
          "participation-practical",
        )}
        {acceptanceNeeded && (
          <section className="participation-section participation-consent">
            <label className="check">
              <Input
                type="checkbox"
                checked={guidelines}
                onChange={(e) => setGuidelines(e.target.checked)}
              />
              <span>
                J’ai pris connaissance des{" "}
                <Button
                  type="button"
                  className="participation-guidelines-link"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    e.preventDefault();
                    setGuidelinesOpen(true);
                  }}
                >
                  bonnes pratiques
                </Button>
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
        <Button
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
              : (submitLabel ?? "Envoyer ma participation")}
        </Button>
      </div>
      {guidelinesOpen && (
        <div className="participation-guidelines-backdrop">
          <Dialog
            className="participation-guidelines-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="participation-guidelines-title"
          >
            <Button
              type="button"
              className="close"
              aria-label="Fermer les bonnes pratiques"
              onClick={() => setGuidelinesOpen(false)}
            >
              <X />
            </Button>
            <h2 id="participation-guidelines-title">Bonnes pratiques</h2>
            <Editorial
              text={guidelinesDocument.body || legalDefaults.GUIDELINES.body}
            />
            <Button
              type="button"
              className="participation-guidelines-return"
              onClick={() => setGuidelinesOpen(false)}
            >
              Retour au formulaire
            </Button>
          </Dialog>
        </div>
      )}
    </form>
  );
}
