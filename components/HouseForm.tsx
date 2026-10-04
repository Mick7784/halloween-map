"use client";
import { useState } from "react";
import { Ghost, MapPin } from "lucide-react";
import { Field, Check, Notice, values, localDate, fears } from "./common";
import type { House } from "../lib/domain";
export default function HouseForm({
  house,
  zone,
  opens,
  closes,
  onSave,
  registration = false,
  center,
}: {
  house?: House;
  zone: string;
  opens: string;
  closes: string;
  onSave: (payload: unknown) => Promise<void>;
  registration?: boolean;
  center: [number, number];
}) {
  const [adapt, setAdapt] = useState(house?.adaptable ?? false),
    [fear, setFear] = useState(house?.fear ?? 2),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [lat, setLat] = useState(house?.latitude ?? center[1]),
    [lng, setLng] = useState(house?.longitude ?? center[0]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const v = values(form);
        setError("");
        setBusy(true);
        try {
          const h = {
            name: v.name,
            address: v.address,
            latitude: lat,
            longitude: lng,
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
            min={-85}
            max={85}
            value={lat}
            onChange={(e) => setLat(Number(e.target.value))}
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
            onChange={(e) => setLng(Number(e.target.value))}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!navigator.geolocation) {
            setError("Géolocalisation indisponible");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setLat(p.coords.latitude);
              setLng(p.coords.longitude);
            },
            () =>
              setError(
                "Position indisponible : renseignez les coordonnées de votre maison.",
              ),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        }}
      >
        <MapPin size={16} /> Utiliser ma position actuelle
      </button>
      <p className="muted small">
        Faites-le sur place, puis vérifiez les coordonnées. Elles ne sont
        envoyées à aucun service de géocodage.
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
      <Notice error={error} />
      <button className="primary wide" disabled={busy}>
        {busy
          ? "Enregistrement…"
          : registration
            ? "Inscrire ma maison"
            : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
