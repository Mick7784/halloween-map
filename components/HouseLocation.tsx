"use client";
import { Input, Select, Button } from "./ui";
import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Check, Search } from "lucide-react";
import { locateOrigin } from "../lib/geolocation";
import type {
  AddressParts,
  AddressSuggestion,
  Commune,
} from "../lib/participation-settings";
import { api } from "./common";
import HouseLocationMap from "./HouseLocationMap";
export type LocationValue = import("../lib/house-form").HouseLocationValue;
const query = (mode: string, p: Record<string, string>) =>
  "location?" + new URLSearchParams({ mode, ...p });
export default function HouseLocation({
  initial,
  legacyAddress,
  center,
  styleUrl,
  allowedCommuneCodes,
  onChange,
}: {
  initial: LocationValue;
  legacyAddress?: string;
  center: [number, number];
  styleUrl: string;
  allowedCommuneCodes: string[];
  onChange: (value: LocationValue) => void;
}) {
  const [value, setValue] = useState(initial),
    [communes, setCommunes] = useState<Commune[]>(
      initial.address.cityCode
        ? [
            {
              code: initial.address.cityCode,
              nom: initial.address.city,
              codesPostaux: [initial.address.postalCode],
            },
          ]
        : [],
    ),
    [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [choosing, setChoosing] = useState(false),
    [busy, setBusy] = useState(false),
    [citiesBusy, setCitiesBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const current = useRef(value),
    locked = useRef(!!initial.point),
    selectedQuery = useRef(""),
    revision = useRef(0);
  function update(next: LocationValue) {
    revision.current++;
    current.current = next;
    setValue(next);
    onChange(next);
  }
  function address(key: keyof AddressParts, text: string) {
    const a = { ...current.current.address, [key]: text };
    if (key === "postalCode") {
      a.city = "";
      a.cityCode = "";
    }
    update({ ...current.current, address: a, confirmed: false });
    setError("");
    setMessage("");
  }
  useEffect(() => {
    if (!/^\d{5}$/.test(value.address.postalCode)) {
      setCommunes([]);
      return;
    }
    let active = true;
    setCitiesBusy(true);
    void api<Commune[]>(
      query("communes", { postalCode: value.address.postalCode }),
    )
      .then((list) => {
        if (!active) return;
        const choices = allowedCommuneCodes.length
          ? list.filter((c) => allowedCommuneCodes.includes(c.code))
          : list;
        setCommunes(choices);
        if (!choices.length) {
          setError("Aucune commune autorisée pour ce code postal.");
          return;
        }
        const selected =
          choices.find((c) => c.code === current.current.address.cityCode) ??
          choices.find(
            (c) =>
              c.nom.toLocaleLowerCase("fr") ===
              current.current.address.city.toLocaleLowerCase("fr"),
          ) ??
          (choices.length === 1 ? choices[0] : null);
        if (selected)
          update({
            ...current.current,
            address: {
              ...current.current.address,
              city: selected.nom,
              cityCode: selected.code,
            },
          });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setCitiesBusy(false);
      });
    return () => {
      active = false;
    };
    // A change in selection must not restart the postal lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.address.postalCode, retry]);
  useEffect(() => {
    const a = value.address;
    if (JSON.stringify(a) === selectedQuery.current) {
      setSuggestions([]);
      return;
    }
    if (a.street.trim().length < 3 || !a.cityCode) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void api<AddressSuggestion[]>(
        query("search", {
          q: `${a.number} ${a.street}`.trim(),
          postalCode: a.postalCode,
          cityCode: a.cityCode,
        }),
      )
        .then((rows) => {
          if (active) setSuggestions(rows);
        })
        .catch((e) => {
          if (active)
            setMessage(
              e.message +
                " La saisie manuelle et le placement restent possibles.",
            );
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value.address]);
  function choose(s: AddressSuggestion) {
    const nextAddress = {
      postalCode: s.postalCode,
      city: s.city,
      cityCode: s.cityCode,
      number: s.number || current.current.address.number,
      street: s.street,
    };
    selectedQuery.current = JSON.stringify(nextAddress);
    update({
      address: nextAddress,
      point: locked.current ? current.current.point : s.point,
      confirmed: false,
    });
    setSuggestions([]);
    setMessage(
      locked.current
        ? "Votre point personnalisé est conservé. Vérifiez-le avant de confirmer."
        : "Adresse trouvée : vérifiez l’entrée de votre maison.",
    );
  }
  function place(point: [number, number]) {
    locked.current = true;
    update({ ...current.current, point, confirmed: false });
    setError("");
  }
  async function locate() {
    setBusy(true);
    setError("");
    const version = revision.current;
    try {
      const p = await locateOrigin(navigator.geolocation);
      const s = await api<AddressSuggestion>(
        query("reverse", { lat: String(p.point[1]), lon: String(p.point[0]) }),
      );
      if (version !== revision.current) return;
      if (
        allowedCommuneCodes.length &&
        !allowedCommuneCodes.includes(s.cityCode)
      )
        throw new Error("Cette commune n’est pas ouverte aux participations.");
      locked.current = true;
      update({
        address: {
          postalCode: s.postalCode,
          city: s.city,
          cityCode: s.cityCode,
          number: s.number,
          street: s.street,
        },
        point: p.point,
        confirmed: false,
      });
      setMessage(
        `Position trouvée (précision ±${Math.round(p.accuracy)} m). Vérifiez et confirmez le point.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    const snapshot = current.current,
      version = revision.current;
    if (!snapshot.point) return;
    setBusy(true);
    setError("");
    try {
      const s = await api<AddressSuggestion>(
        query("reverse", {
          lat: String(snapshot.point[1]),
          lon: String(snapshot.point[0]),
        }),
      );
      if (version !== revision.current) return;
      if (s.cityCode !== snapshot.address.cityCode)
        throw new Error(
          "Le point doit se trouver dans la commune choisie. Ajustez-le ou corrigez la commune.",
        );
      update({ ...snapshot, confirmed: true });
      setChoosing(false);
      setMessage(
        "Point confirmé. Il sera utilisé sur la carte et pour les parcours.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {legacyAddress && !initial.address.cityCode && (
        <p className="participation-help">
          Adresse actuelle : {legacyAddress}. Complétez les champs ci-dessous
          pour vérifier l’adresse française.
        </p>
      )}
      <div className="participation-address-grid">
        <label className="field">
          <span>Code postal *</span>
          <Input
            name="postalCode"
            required
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            autoComplete="postal-code"
            value={value.address.postalCode}
            onChange={(e) =>
              address(
                "postalCode",
                e.target.value.replace(/\D/g, "").slice(0, 5),
              )
            }
          />
        </label>
        <label className="field">
          <span>Ville *</span>
          <Select
            name="cityCode"
            required
            disabled={citiesBusy}
            value={value.address.cityCode}
            onChange={(e) => {
              const c = communes.find((c) => c.code === e.target.value);
              update({
                ...current.current,
                address: {
                  ...current.current.address,
                  city: c?.nom ?? "",
                  cityCode: c?.code ?? "",
                },
                confirmed: false,
              });
            }}
          >
            <option value="">
              {citiesBusy ? "Recherche…" : "Choisir une commune"}
            </option>
            {communes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nom}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span>Numéro *</span>
          <Input
            name="number"
            required
            maxLength={20}
            placeholder="12 bis"
            value={value.address.number}
            onChange={(e) => address("number", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Rue *</span>
          <Input
            name="street"
            required
            autoComplete="off"
            placeholder="Rue de la République"
            value={value.address.street}
            onChange={(e) => address("street", e.target.value)}
          />
        </label>
      </div>
      {suggestions.length > 0 && (
        <ul
          className="participation-address-suggestions"
          aria-label="Adresses françaises proposées"
        >
          {suggestions.map((s, n) => (
            <li key={n}>
              <Button type="button" onClick={() => choose(s)}>
                <Search size={15} />
                {s.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <HouseLocationMap
        point={value.point}
        center={center}
        choosing={choosing}
        styleUrl={styleUrl}
        onPoint={place}
      />
      <div className="participation-location-actions">
        <Button type="button" onClick={locate} disabled={busy}>
          <LocateFixed size={16} />
          Me localiser
        </Button>
        <Button
          type="button"
          aria-pressed={choosing}
          onClick={() => {
            setChoosing(!choosing);
            setMessage(
              "Touchez la carte ou déplacez le marqueur, puis confirmez le point.",
            );
          }}
        >
          <MapPin size={16} />
          {choosing ? "Ajustement en cours" : "Placer manuellement"}
        </Button>
      </div>
      <p className="participation-help">
        Vérifiez que le point correspond bien à l’entrée de votre maison.
      </p>
      <details className="participation-coordinates">
        <summary>Ajuster les coordonnées</summary>
        <div className="participation-address-grid">
          <label className="field">
            <span>Latitude</span>
            <Input
              type="number"
              step="any"
              value={value.point?.[1] ?? ""}
              onChange={(e) =>
                place([
                  current.current.point?.[0] ?? center[0],
                  Number(e.target.value),
                ])
              }
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <Input
              type="number"
              step="any"
              value={value.point?.[0] ?? ""}
              onChange={(e) =>
                place([
                  Number(e.target.value),
                  current.current.point?.[1] ?? center[1],
                ])
              }
            />
          </label>
        </div>
      </details>
      <Button
        type="button"
        className="participation-confirm-point"
        disabled={
          !value.point || !value.address.cityCode || busy || value.confirmed
        }
        onClick={confirm}
      >
        <Check size={16} />
        {value.confirmed
          ? "Point confirmé"
          : busy
            ? "Vérification du point…"
            : "Confirmer le point de ma maison"}
      </Button>
      {message && (
        <p className="participation-help" role="status">
          {message}
        </p>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
          <Button
            type="button"
            disabled={citiesBusy}
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Réessayer
          </Button>
        </div>
      )}
    </>
  );
}
