"use client";

import { useEffect, useRef } from "react";

/**
 * V0.9.1 — decorative atmosphere. Only the homepage mounts this component.
 *
 * The base image remains the exact static fallback when sensor access is absent.
 * Alpha planes retain the pixels and canvas of the shared restored master.
 * They load only after a valid reading on an eligible portrait mobile.
 *
 * DeviceOrientationEvent.requestPermission() is deliberately never called:
 * the illustration must never request access or block navigation.
 */
const MOBILE_PORTRAIT = "(max-width: 759px) and (orientation: portrait)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const DEPTH_ASSETS = ["far", "mid", "near"].map(
  (plane) => `/art/home-v091-${plane}.webp`,
);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type Tilt = { x: number; y: number };

export default function HomeAtmosphere() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const art = container.current;
    if (!art || typeof window.matchMedia !== "function") return;

    const mobile = window.matchMedia(MOBILE_PORTRAIT);
    const reducedMotion = window.matchMedia(REDUCED_MOTION);
    // Permission-gated browsers keep the decorative scene static. Never
    // prompt, probe a permission, or rely on synthetic readings there.
    const sensor = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & { requestPermission?: unknown })
      | undefined;
    const sensorAvailable = !!sensor && typeof sensor.requestPermission !== "function";
    const target: Tilt = { x: 0, y: 0 };
    const drawn: Tilt = { x: 0, y: 0 };
    let baseline: Tilt | null = null;
    let subscribed = false;
    let frame = 0;
    let disposed = false;
    let depthReady = false;
    let loadStarted = false;

    const enabled = () =>
      sensorAvailable &&
      mobile.matches &&
      !reducedMotion.matches &&
      document.visibilityState === "visible";

    const setOffsets = (x: number, y: number) => {
      // Displacements stay in CSS vars. Only the artwork moves; never the UI.
      art.style.setProperty("--depth-far-x", `${(x * 2.4).toFixed(2)}px`);
      art.style.setProperty("--depth-far-y", `${(y * 1.5).toFixed(2)}px`);
      art.style.setProperty("--depth-mid-x", `${(x * 5).toFixed(2)}px`);
      art.style.setProperty("--depth-mid-y", `${(y * 3).toFixed(2)}px`);
      art.style.setProperty("--depth-near-x", `${(x * 8).toFixed(2)}px`);
      art.style.setProperty("--depth-near-y", `${(y * 4.5).toFixed(2)}px`);
    };

    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      baseline = null;
      target.x = target.y = drawn.x = drawn.y = 0;
      setOffsets(0, 0);
      art.removeAttribute("data-home-motion");
    };

    const animate = () => {
      frame = 0;
      if (!enabled()) {
        reset();
        return;
      }
      drawn.x += (target.x - drawn.x) * 0.18;
      drawn.y += (target.y - drawn.y) * 0.18;
      setOffsets(drawn.x, drawn.y);
      if (
        Math.abs(target.x - drawn.x) > 0.006 ||
        Math.abs(target.y - drawn.y) > 0.006
      ) {
        frame = window.requestAnimationFrame(animate);
      }
    };

    const activate = () => {
      if (disposed || !enabled() || !baseline || !depthReady) return;
      art.setAttribute("data-home-motion", "active");
      if (!frame) frame = window.requestAnimationFrame(animate);
    };

    const loadDepth = () => {
      if (depthReady) { activate(); return; }
      if (loadStarted) return;
      loadStarted = true;
      void Promise.all(DEPTH_ASSETS.map(async (src) => {
        const plane = new Image();
        plane.src = src;
        await plane.decode();
      })).then(() => {
        depthReady = true;
        activate();
      }).catch(() => {
        // Failed or unavailable optional assets leave the static master.
        // No repeated requests, permission prompts, or broken moving layers.
      });
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (
        !enabled() ||
        typeof event.beta !== "number" ||
        typeof event.gamma !== "number" ||
        !Number.isFinite(event.beta) ||
        !Number.isFinite(event.gamma)
      ) return;

      // First valid reading anchors the natural hand-held posture, rather
      // than jumping when a sensor becomes available after a permission grant.
      if (!baseline) {
        baseline = { x: event.gamma, y: event.beta };
        loadDepth();
        return;
      }

      // Relative tilt only; cap every displacement. The user can still read
      // the central title, clock and authentication controls without motion.
      target.x = clamp((event.gamma - baseline.x) / 18, -1, 1);
      target.y = clamp((event.beta - baseline.y) / 18, -1, 1);
      if (depthReady && !frame) frame = window.requestAnimationFrame(animate);
    };

    const reconcile = () => {
      if (enabled() && !subscribed) {
        window.addEventListener("deviceorientation", onOrientation, { passive: true });
        subscribed = true;
        art.setAttribute("data-home-sensor", "listening");
      } else if (!enabled() && subscribed) {
        window.removeEventListener("deviceorientation", onOrientation);
        subscribed = false;
        art.removeAttribute("data-home-sensor");
        reset();
      } else if (!enabled()) {
        reset();
      }
    };

    mobile.addEventListener("change", reconcile);
    reducedMotion.addEventListener("change", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    reconcile();

    return () => {
      disposed = true;
      mobile.removeEventListener("change", reconcile);
      reducedMotion.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      if (subscribed) window.removeEventListener("deviceorientation", onOrientation);
      art.removeAttribute("data-home-sensor");
      reset();
    };
  }, []);

  return (
    <div className="home-art" aria-hidden="true" ref={container} data-depth-assets="ready">
      <div className="home-art-plane home-art-plane--far" />
      <div className="home-art-plane home-art-plane--mid" />
      <div className="home-art-plane home-art-plane--near" />
    </div>
  );
}
