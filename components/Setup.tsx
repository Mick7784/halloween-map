"use client";
import { useState } from "react";
import { DateTime } from "luxon";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { api, Field, Check, Notice, values, numeric } from "./common";
type Wizard = {
  instance: {
    public_name: string;
    territory: string;
    postal_code: string;
    country: string;
    timezone: string;
    latitude: number;
    longitude: number;
    zoom: number;
  };
  admin: { display_name: string; email: string; password: string };
  season: {
    year: number;
    registrations_open_at: string;
    purge_at: string;
    opens_at: string;
    closes_at: string;
    registrations_open: boolean;
  };
};
export default function Setup() {
  const year = DateTime.now().setZone("Europe/Paris").year;
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [data, setData] = useState<Wizard>({
    instance: {
      public_name: "Halloween · Carte des maisons",
      territory: "",
      postal_code: "",
      country: "France",
      timezone: "Europe/Paris",
      latitude: 0,
      longitude: 0,
      zoom: 13,
    },
    admin: { display_name: "", email: "", password: "" },
    season: {
      year,
      registrations_open_at: `${year}-10-01T00:00`,
      purge_at: `${year}-11-02T12:00`,
      opens_at: `${year}-10-31T12:00`,
      closes_at: `${year}-11-01T00:00`,
      registrations_open: true,
    },
  });
  const titles = [
    "Votre territoire",
    "Premier Super Admin",
    "Première saison",
    "Tout est prêt",
  ];
  async function submit(form: HTMLFormElement) {
    const v = values(form);
    setError("");
    setBusy(true);
    try {
      if (step === 0) {
        const i = numeric(v, [
          "latitude",
          "longitude",
          "zoom",
        ]) as unknown as Wizard["instance"];
        delete (i as unknown as Record<string, unknown>).token;
        let center = {
          latitude: i.latitude,
          longitude: i.longitude,
          zoom: i.zoom,
        };
        if (v.auto === "on")
          center = await api("geocode", {
            query: `${v.territory} ${v.postal_code} ${v.country}`,
          });
        setData({ ...data, instance: { ...i, ...center } });
        setStep(1);
      } else if (step === 1) {
        setData({ ...data, admin: v as Wizard["admin"] });
        setStep(2);
      } else if (step === 2) {
        setData({
          ...data,
          season: {
            year: Number(v.year),
            registrations_open_at: v.registrations_open_at,
            purge_at: v.purge_at,
            opens_at: v.opens_at,
            closes_at: v.closes_at,
            registrations_open: v.registrations_open === "on",
          },
        });
        setStep(3);
      } else {
        await api("setup", data);
        window.location.href = "/admin";
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="narrow">
      <div className="eyebrow">BIENVENUE SUR HALLOWEEN MAP</div>
      <h1>Une nuit. Toute votre commune.</h1>
      <p className="muted">
        Configurez votre événement en quatre étapes. Aucune donnée personnelle
        ne sera publique avant l’ouverture de la carte.
      </p>
      <ol className="steps">
        {titles.map((t, n) => (
          <li key={t} className={n <= step ? "current" : ""}>
            <span>{n + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <section className="panel">
        <h2>
          {step === 0 ? (
            <MapPin />
          ) : step === 1 ? (
            <ShieldCheck />
          ) : step === 2 ? (
            <CalendarDays />
          ) : (
            <CheckCircle2 />
          )}
          {titles[step]}
        </h2>
        <form
          key={step}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          {step === 0 && (
            <>
              <Field
                label="Nom public de l’événement"
                name="public_name"
                value={data.instance.public_name}
              />
              <div className="grid two">
                <Field
                  label="Commune / territoire"
                  name="territory"
                  value={data.instance.territory}
                />
                <Field
                  label="Code postal"
                  name="postal_code"
                  value={data.instance.postal_code}
                />
                <Field
                  label="Pays"
                  name="country"
                  value={data.instance.country}
                />
                <Field
                  label="Fuseau horaire"
                  name="timezone"
                  value={data.instance.timezone}
                />
              </div>
              <Check
                name="auto"
                label="Déterminer automatiquement le centre de la carte"
                checked
              />
              <p className="muted small">
                La recherche envoie uniquement le territoire à OpenStreetMap. En
                cas d’indisponibilité, décochez cette option et saisissez le
                centre.
              </p>
              <div className="grid three">
                <Field
                  label="Latitude"
                  name="latitude"
                  type="number"
                  value={data.instance.latitude}
                  min={-85}
                  max={85}
                />
                <Field
                  label="Longitude"
                  name="longitude"
                  type="number"
                  value={data.instance.longitude}
                  min={-180}
                  max={180}
                />
                <Field
                  label="Zoom"
                  name="zoom"
                  type="number"
                  value={data.instance.zoom}
                  min={2}
                  max={18}
                />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <Field
                label="Nom d’affichage (administration seulement)"
                name="display_name"
                value={data.admin.display_name}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                value={data.admin.email}
              />
              <Field
                label="Mot de passe (12 caractères minimum)"
                name="password"
                type="password"
                value={data.admin.password}
              />
              <p className="muted">
                Ce compte reçoit le rôle Super Admin et permet de gérer tous les
                accès.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <Field
                label="Année"
                name="year"
                type="number"
                value={data.season.year}
              />
              <Field
                label="Ouverture des inscriptions"
                name="registrations_open_at"
                type="datetime-local"
                value={data.season.registrations_open_at}
              />
              <Field
                label="Purge définitive"
                name="purge_at"
                type="datetime-local"
                value={data.season.purge_at}
              />
              <Field
                label={`Ouverture carte (${data.instance.timezone})`}
                name="opens_at"
                type="datetime-local"
                value={data.season.opens_at}
              />
              <Field
                label="Fermeture publique de la carte"
                name="closes_at"
                type="datetime-local"
                value={data.season.closes_at}
              />
              <Check
                name="registrations_open"
                label="Ouvrir les inscriptions"
                checked={data.season.registrations_open}
              />
              <p className="notice info">
                Vous activerez la saison dans le back-office. Aucune saison ne
                s’active automatiquement.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <dl className="recap">
                <dt>Événement</dt>
                <dd>{data.instance.public_name}</dd>
                <dt>Territoire</dt>
                <dd>
                  {data.instance.territory} · {data.instance.postal_code}
                </dd>
                <dt>Carte</dt>
                <dd>
                  {data.instance.latitude.toFixed(4)},{" "}
                  {data.instance.longitude.toFixed(4)} · zoom{" "}
                  {data.instance.zoom}
                </dd>
                <dt>Super Admin</dt>
                <dd>{data.admin.email}</dd>
                <dt>Saison</dt>
                <dd>
                  {data.season.year} ·{" "}
                  {data.season.opens_at.replace("T", " à ")} →{" "}
                  {data.season.closes_at.replace("T", " à ")}
                </dd>
              </dl>
              <p className="muted">
                Le wizard sera verrouillé après la création. La purge programmée
                supprimera les comptes participants et leurs maisons ; seules
                les statistiques anonymes seront conservées.
              </p>
            </>
          )}
          <Notice error={error} />
          <div className="actions">
            {step > 0 && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                }}
              >
                Retour
              </button>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Configuration…"
                : step === 3
                  ? "Créer mon événement"
                  : "Continuer"}
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
