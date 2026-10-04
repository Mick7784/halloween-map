"use client";
import { useState } from "react";
import type { Instance } from "../lib/domain";
import { api, Field, Notice, values } from "./common";
import FrenchDate from "./FrenchDate";
import MapView from "./Map";
export default function EventSettings({
  instance,
  mapStyle,
  save,
}: {
  instance: Instance;
  mapStyle: string;
  save: (p: unknown) => Promise<unknown>;
}) {
  const [latitude, setLatitude] = useState(instance.latitude),
    [longitude, setLongitude] = useState(instance.longitude),
    [zone, setZone] = useState(instance.timezone),
    [zoom, setZoom] = useState(instance.zoom),
    [place, setPlace] = useState(instance.territory),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  return (
    <section className="panel">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const v = values(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await save({
              ...v,
              latitude,
              longitude,
              timezone: zone,
              zoom,
              defaultOpen: v.recurring_open.slice(5),
              defaultClose: v.recurring_close.slice(5),
            });
            setSuccess("Paramètres enregistrés.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Événement</h2>
        <Field
          name="public_name"
          label="Nom public"
          value={instance.public_name}
        />
        <div className="grid two">
          <Field
            name="territory"
            label="Territoire / commune"
            value={instance.territory}
          />
          <Field
            name="postal_code"
            label="Code postal"
            value={instance.postal_code}
          />
        </div>
        <Field name="country" label="Pays" value={instance.country} />
        <h2>Localisation</h2>
        <button
          type="button"
          disabled={busy}
          onClick={async (e) => {
            const v = values(e.currentTarget.form!);
            setBusy(true);
            setError("");
            try {
              const g = await api<{
                latitude: number;
                longitude: number;
                zoom: number;
                timezone: string | null;
                place: string;
              }>("geocode", {
                query: [v.territory, v.postal_code, v.country].join(", "),
              });
              setLatitude(g.latitude);
              setLongitude(g.longitude);
              setZoom(g.zoom);
              if (g.timezone) setZone(g.timezone);
              setPlace(g.place);
              setSuccess("Lieu détecté. Vérifiez la carte puis enregistrez.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Détecter automatiquement le lieu
        </button>
        <p>{place}</p>
        <p className="small muted">
          {latitude.toFixed(5)}, {longitude.toFixed(5)} · {zone}
        </p>
        <div className="settings-map">
          <MapView
            key={latitude + "," + longitude + "," + zoom}
            houses={[]}
            center={[longitude, latitude]}
            zoom={zoom}
            styleUrl={mapStyle}
            onSelect={() => {}}
          />
        </div>
        <details>
          <summary>Réglages avancés</summary>
          <div className="grid two">
            <label className="field">
              <span>Latitude</span>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Zoom</span>
              <input
                type="number"
                min={2}
                max={18}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Fuseau horaire</span>
              <input value={zone} onChange={(e) => setZone(e.target.value)} />
            </label>
          </div>
        </details>
        <h2>Dates récurrentes proposées</h2>
        <p className="small muted">
          Ces valeurs préremplissent l’ouverture et la fermeture d’une prochaine
          édition. Le calendrier de la saison reste configurable séparément.
        </p>
        {[
          ["open", "Ouverture", String(instance.config.defaultOpen)],
          ["close", "Fermeture", String(instance.config.defaultClose)],
        ].map(([key, label, v]) => (
          <div className="grid two" key={key}>
            <FrenchDate
              recurring
              label={label + " (jour et mois)"}
              name={"recurring_" + key}
              value={"2000-" + v}
            />
          </div>
        ))}
        <Notice error={error} />
        {success && (
          <p className="notice info" role="status">
            {success}
          </p>
        )}
        <button disabled={busy} className="primary">
          Enregistrer les paramètres
        </button>
      </form>
    </section>
  );
}
