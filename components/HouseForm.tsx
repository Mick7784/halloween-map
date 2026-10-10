"use client";
import { Input, Button } from "./ui";
import { useState } from "react";
import useDraftGuard from "./useDraftGuard";
import type { House } from "../lib/domain";
import {
  publicParticipationSettings,
  formatAddress,
  type ParticipationSettings,
} from "../lib/participation-settings";
import { initialHouseLocation, validateHouseForm } from "../lib/house-form";
import { localDate, Notice } from "./common";
import HouseLocation from "./HouseLocation";
import {
  HouseNameField,
  HouseActivityFields,
  HouseScheduleFields,
  HouseFearFields,
  HouseTextField,
} from "./HouseFields";
export default function HouseForm({
  house,
  zone,
  opens,
  closes,
  center,
  styleUrl,
  isTest = false,
  settings: source,
  onSave,
}: {
  house: House;
  zone: string;
  opens: string;
  closes: string;
  center: [number, number];
  styleUrl: string;
  isTest?: boolean;
  settings?: ParticipationSettings;
  onSave: (payload: unknown) => Promise<void>;
}) {
  const settings = publicParticipationSettings(source);
  const [location, setLocation] = useState(() => initialHouseLocation(house));
  // Admins can maintain legacy addresses without inventing a commune or geocoding them.
  const [legacy, setLegacy] = useState(!house.address_parts);
  const [address, setAddress] = useState(house.address);
  const [latitude, setLatitude] = useState(String(house.latitude)),
    [longitude, setLongitude] = useState(String(house.longitude));
  const [confirmed, setConfirmed] = useState(true);
  const [draft, setDraft] = useState({
    name: house.name,
    activities: house.activities,
    starts_at: localDate(house.starts_at, zone),
    ends_at: localDate(house.ends_at, zone),
    fear: house.fear,
    adaptable: house.adaptable,
    rp: house.rp,
    practical: house.practical,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useDraftGuard(dirty);
  function patch(value: Partial<typeof draft>) {
    setDirty(true);
    setDraft((s) => ({ ...s, ...value }));
  }
  return (
    <form
      className="participation-form admin-house-form"
      onChange={() => setDirty(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          const payload = validateHouseForm(
            {
              ...draft,
              address: legacy ? address : formatAddress(location.address),
              ...(legacy ? {} : { address_parts: location.address }),
              latitude: legacy
                ? latitude.trim()
                  ? Number(latitude)
                  : undefined
                : location.point?.[1],
              longitude: legacy
                ? longitude.trim()
                  ? Number(longitude)
                  : undefined
                : location.point?.[0],
              position_confirmed: legacy ? confirmed : location.confirmed,
            },
            { zone, opens, closes, isTest, adminEdit: true, settings },
          );
          await onSave(payload);
          setDirty(false);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="participation-section">
        <h2>Localisation de la maison</h2>
        {legacy ? (
          <>
            <p className="participation-help">
              Adresse historique en saisie administrative. Vous pouvez la
              conserver ou passer à l’adresse structurée.
            </p>
            <label className="field">
              <span>Adresse *</span>
              <Input
                required
                maxLength={200}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <div className="participation-address-grid">
              <label className="field">
                <span>Latitude *</span>
                <Input
                  required
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="field">
                <span>Longitude *</span>
                <Input
                  required
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
            </div>
            <label className="check">
              <Input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Je confirme que ce point correspond à la maison.
            </label>
            <Button type="button" onClick={() => setLegacy(false)}>
              Utiliser l’adresse structurée
            </Button>
          </>
        ) : (
          <HouseLocation
            initial={initialHouseLocation(house)}
            legacyAddress={house.address}
            center={center}
            styleUrl={styleUrl}
            allowedCommuneCodes={[]}
            onChange={setLocation}
          />
        )}
      </section>
      <section className="participation-section">
        <h2>Nom de la maison</h2>
        <HouseNameField
          value={draft.name}
          onChange={(name) => patch({ name })}
        />
      </section>
      <section className="participation-section">
        <h2>Activités proposées</h2>
        <HouseActivityFields
          value={draft.activities}
          onChange={(activities) => patch({ activities })}
        />
      </section>
      <section className="participation-section">
        <h2>Horaires d’accueil</h2>
        <HouseScheduleFields
          starts={draft.starts_at}
          ends={draft.ends_at}
          zone={zone}
          opens={opens}
          closes={closes}
          isTest={isTest}
          onStart={(starts_at) => patch({ starts_at })}
          onEnd={(ends_at) => patch({ ends_at })}
        />
      </section>
      <section className="participation-section">
        <h2>Niveau de frayeur</h2>
        <HouseFearFields
          fear={draft.fear}
          adapt={draft.adaptable}
          labels={settings.fearLabels}
          onFear={(fear) => patch({ fear })}
          onAdapt={(adaptable) => patch({ adaptable })}
        />
      </section>
      <section className="participation-section">
        <h2>Description / ambiance</h2>
        <HouseTextField
          name="rp"
          value={draft.rp}
          limit={300}
          onChange={(rp) => patch({ rp })}
        />
        <small className="participation-help">
          L’édition administrative conserve la limite historique de 300
          caractères.
        </small>
      </section>
      <section className="participation-section">
        <h2>Infos pratiques</h2>
        <HouseTextField
          name="practical"
          value={draft.practical}
          limit={300}
          onChange={(practical) => patch({ practical })}
        />
      </section>
      <Notice error={error} />
      <Button
        className="primary wide"
        disabled={busy || !(legacy ? confirmed : location.confirmed)}
      >
        {busy ? "Enregistrement…" : "Enregistrer les modifications"}
      </Button>
    </form>
  );
}
