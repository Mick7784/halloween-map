"use client";
import { useEffect, useRef, useState } from "react";
import { coherentCompass, freshCompass, readCompass, type CompassEvent, type CompassReading, type CompassSample } from "../lib/map-orientation";
export const MAP_ORIENTATION_CHOICE = "halloween-map:orientation-choice:v1";
type Choice = "granted" | "declined" | null;
type SensorClass = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> };
// If browser storage is blocked, remember the choice for this page lifetime.
let memoryChoice: Choice = null;
function readChoice(): Choice {
  try {
    const value = localStorage.getItem(MAP_ORIENTATION_CHOICE);
    return value === "granted" || value === "declined" ? value : memoryChoice;
  } catch { return memoryChoice; }
}
function saveChoice(choice: Exclude<Choice, null>) {
  memoryChoice = choice;
  try { localStorage.setItem(MAP_ORIENTATION_CHOICE, choice); } catch { /* Optional preference only. */ }
}
export default function useMapOrientation(enabled: boolean) {
  const [reading, setReading] = useState<CompassReading | null>(null);
  const [offer, setOffer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [pending, setPending] = useState(false);
  const request = useRef({ id: 0, busy: false });
  const mounted = useRef(false);
  const capability = useRef<SensorClass | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const sensor = window.DeviceOrientationEvent as SensorClass | undefined;
    capability.current = sensor ?? null;
    const media = window.matchMedia("(max-width: 767px) and (orientation: portrait) and (pointer: coarse)");
    const preference = choice ?? readChoice();
    let sample: CompassSample | null = null;
    let subscribed = false;
    let hasReading = false;
    let stopped = false;
    let timer: number | undefined;
    const allowed = () => enabled && !dialog && preference !== "declined" && !!sensor &&
      window.isSecureContext && media.matches && document.visibilityState === "visible" &&
      !document.querySelector('[role="dialog"][aria-modal="true"]');
    function onOrientation(event: DeviceOrientationEvent) {
      if (!allowed()) return;
      const value = readCompass(event as DeviceOrientationEvent & CompassEvent);
      sample = value ? coherentCompass(sample, value, Date.now()) : null;
    }
    function sync() {
      if (stopped) return;
      const active = allowed();
      if (active !== subscribed) {
        if (active) window.addEventListener("deviceorientation", onOrientation, { passive: true });
        else window.removeEventListener("deviceorientation", onOrientation);
        subscribed = active;
        sample = null;
        if (active) timer = window.setInterval(sync, 100);
        else { clearInterval(timer); timer = undefined; }
      }
      const value = active ? freshCompass(sample, Date.now()) : null;
      if (value || hasReading) setReading(value);
      hasReading = !!value;
      setOffer(active && !value && typeof sensor?.requestPermission === "function" && preference === null);
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      stopped = true;
      observer.disconnect();
      clearInterval(timer);
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("deviceorientation", onOrientation);
      setReading(null);
      setOffer(false);
    };
  }, [enabled, choice, dialog]);
  function explain() {
    // Seeing/closing this optional explanation counts as a response. No repeat.
    saveChoice("declined");
    setDialog(true);
  }
  function decline() {
    request.current.id++;
    saveChoice("declined");
    setChoice("declined");
    setDialog(false);
  }
  async function accept() {
    if (request.current.busy) return;
    request.current.busy = true;
    const id = ++request.current.id;
    setPending(true);
    let result: Choice = "declined";
    try {
      // Called directly from a user click, before any await: preserve activation.
      const sensor = capability.current;
      if (sensor?.requestPermission && await sensor.requestPermission(true) === "granted") result = "granted";
    } catch { /* Refusal and unsupported permission APIs retain the GPS dot. */ }
    request.current.busy = false;
    if (id !== request.current.id || !mounted.current) return;
    saveChoice(result!);
    setPending(false);
    setChoice(result);
    setDialog(false);
  }
  return { reading: enabled && !dialog ? reading : null, offer, dialog, pending, explain, decline, accept };
}
