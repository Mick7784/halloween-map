"use client";
import { locateOrigin } from "../lib/geolocation";
import { useState } from "react";
import { Ghost, MapPin } from "lucide-react";
import { Field, Check, Notice, values, localDate, fears } from "./common";
import Editorial from "./Editorial";
import Link from "next/link";
import type { LegalDocument, LegalKind } from "../lib/content";
import type { House } from "../lib/domain";
export default function HouseForm({
  house,
  zone,
  opens,
  closes,
  onSave,
  registration = false,
  documents,
}: {
  house?: House;
  documents?: Record<LegalKind, LegalDocument>;
  zone: string;
  opens: string;
  closes: string;
  onSave: (payload: unknown) => Promise<void>;
  registration?: boolean;
  center: [number, number];
}) {
  const [pending, setPending] = useState<unknown>(null),
    [terms, setTerms] = useState(false),
    [guidelines, setGuidelines] = useState(false);
  const [adapt, setAdapt] = useState(house?.adaptable ?? false),
    [fear, setFear] = useState(house?.fear ?? 2),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [lat, setLat] = useState<number | string>(house?.latitude ?? ""),
    [lng, setLng] = useState<number | string>(house?.longitude ?? ""),
    [confirmed, setConfirmed] = useState(!!house),
    [locating, setLocating] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (!confirmed || locating || lat === "" || lng === "") {
          setError(
            "Saisissez et confirmez le point de votre maison, ou utilisez votre position sur place.",
          );
          return;
        }
        const v = values(form);
        setError("");
        setBusy(true);
        try {
          const h = {
            name: v.name,
            address: v.address,
            latitude: Number(lat),
            longitude: Number(lng),
            position_confirmed: confirmed,
            activities: ["DECORATION", "CANDY", "ACTING"].filter(
              (a) => v[a] === "on",
            ),
            starts_at: v.starts_at,
            ends_at: v.ends_at,
            fear,
            adaptable: adapt,
            rp: v.rp,
            practical: v.practical,
          };
          if (documents) {
            setTerms(false);
            setGuidelines(false);
            setPending(h);
            return;
          }
          await onSave(
            registration
              ? { account: { email: v.email, password: v.password }, house: h }
              : h,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {registration && (
        <>
          <h2>Votre compte privé</h2>
          <Field label="Email" name="email" type="email" />
          <Field
            label="Mot de passe (12 caractères minimum)"
            name="password"
            type="password"
          />
          <p className="muted small">
            Votre email reste privé. Utilisez un nom fictif pour votre maison.
          </p>
          <hr />
        </>
      )}
      <Field
        label="Nom fictif de la maison"
        name="name"
        value={house?.name}
        placeholder="La maison des petits fantômes"
      />
      <Field
        label="Adresse de la maison"
        name="address"
        value={house?.address}
        placeholder="Numéro et rue"
      />
      <p className="muted small">
        L’adresse et le point seront visibles uniquement pendant les horaires
        d’accueil, après validation.
      </p>
      <div className="grid two">
        <label className="field">
          <span>Latitude *</span>
          <input
            required
            type="number"
            step="any"
            min={-90}
            max={90}
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label className="field">
          <span>Longitude *</span>
          <input
            required
            type="number"
            step="any"
            min={-180}
            max={180}
            value={lng}
            onChange={(e) => {
              setLng(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={locating}
        onClick={async () => {
          setError("");
          setLocating(true);
          try {
            const p = await locateOrigin(navigator.geolocation);
            setLat(p.point[1]);
            setLng(p.point[0]);
            setConfirmed(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLocating(false);
          }
        }}
      >
        <MapPin size={16} />{" "}
        {locating ? "Recherche de position…" : "Utiliser ma position actuelle"}
      </button>
      <label className="check position-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={locating || lat === "" || lng === ""}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Je confirme que ce point correspond à ma maison.
      </label>
      <p className="muted small">
        Localisez-vous sur place ou saisissez les coordonnées, puis confirmez le
        point. Aucun géocodage automatique de l’adresse.
      </p>
      <fieldset>
        <legend>Activités proposées *</legend>
        <div className="choices">
          <Check
            name="DECORATION"
            label="Décoration"
            checked={house?.activities.includes("DECORATION") ?? true}
          />
          <Check
            name="CANDY"
            label="Bonbons"
            checked={house?.activities.includes("CANDY") ?? true}
          />
          <Check
            name="ACTING"
            label="Mise en scène / acting"
            checked={house?.activities.includes("ACTING") ?? false}
          />
        </div>
      </fieldset>
      <div className="grid two">
        <Field
          label={`Début (${zone})`}
          name="starts_at"
          type="datetime-local"
          value={
            house ? localDate(house.starts_at, zone) : localDate(opens, zone)
          }
          min={localDate(opens, zone)}
          max={localDate(closes, zone)}
        />
        <Field
          label="Fin d’accueil"
          name="ends_at"
          type="datetime-local"
          value={
            house ? localDate(house.ends_at, zone) : localDate(closes, zone)
          }
          min={localDate(opens, zone)}
          max={localDate(closes, zone)}
        />
      </div>
      <fieldset>
        <legend>Niveau de frayeur</legend>
        <div className={adapt ? "fear disabled" : "fear"}>
          <input
            aria-label="Niveau de frayeur"
            type="range"
            min={1}
            max={5}
            value={fear}
            disabled={adapt}
            onChange={(e) => setFear(Number(e.target.value))}
          />
          <div className="fear-labels">
            {fears.map((f, n) => (
              <span key={f} className={n + 1 === fear ? "selected" : ""}>
                {f}
              </span>
            ))}
          </div>
        </div>
        <label className="adapt">
          <Ghost size={21} />
          <span>Je m’adapte à mes visiteurs</span>
          <input
            type="checkbox"
            checked={adapt}
            onChange={(e) => setAdapt(e.target.checked)}
          />
        </label>
      </fieldset>
      <label className="field">
        <span>Description / ambiance (RP)</span>
        <textarea
          name="rp"
          maxLength={300}
          rows={3}
          defaultValue={house?.rp}
          placeholder="Les petits fantômes vous attendent au fond du jardin…"
        />
        <small>300 caractères maximum. Aucun nom personnel.</small>
      </label>
      <label className="field practical">
        <span>Informations pratiques · accès, stationnement</span>
        <textarea
          name="practical"
          maxLength={300}
          rows={2}
          defaultValue={house?.practical}
          placeholder="Portail blanc au fond de la cour. Passez par l’allée à droite."
        />
      </label>
      {pending !== null && documents && (
        <div className="modal-backdrop">
          <section
            className="dialog panel consent-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <button
              type="button"
              className="close"
              onClick={() => setPending(null)}
              aria-label="Fermer"
            >
              ×
            </button>
            <h2 id="consent-title">Avant de participer</h2>
            <Editorial text={documents.GUIDELINES.body} />
            <label className="acceptance">
              <input
                type="checkbox"
                checked={guidelines}
                onChange={(e) => setGuidelines(e.target.checked)}
              />
              Je confirme avoir lu les bonnes pratiques et disposer de
              l’autorisation nécessaire pour inscrire cette adresse.
            </label>
            <label className="acceptance">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              J’ai lu et j’accepte les{" "}
              <Link href="/terms" target="_blank">
                Conditions d’utilisation
              </Link>
              .
            </label>
            <Link href="/privacy" target="_blank">
              Politique de confidentialité
            </Link>
            <Notice error={error} />
            <button
              type="button"
              className="primary wide"
              disabled={!terms || !guidelines || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const acceptance = {
                    terms,
                    guidelines,
                    terms_version: documents.TERMS.version,
                    guidelines_version: documents.GUIDELINES.version,
                  };
                  await onSave(
                    house
                      ? { ...(pending as Record<string, unknown>), acceptance }
                      : { house: pending, acceptance },
                  );
                  setPending(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmer ma participation
            </button>
          </section>
        </div>
      )}
      <Notice error={error} />
      <button
        className="primary wide"
        disabled={busy || locating || !confirmed}
      >
        {busy
          ? "Enregistrement…"
          : registration
            ? "Inscrire ma maison"
            : house
              ? "Enregistrer les modifications"
              : "Envoyer ma participation"}
      </button>
    </form>
  );
}
