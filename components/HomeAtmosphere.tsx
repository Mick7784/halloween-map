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

export default function HomeAtmosphere({ motionAllowed = true }: { motionAllowed?: boolean }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const art = container.current;
    if (!art || typeof window.matchMedia !== "function") return;

    const mobile = window.matchMedia(MOBILE_PORTRAIT);
    const reducedMotion = window.matchMedia(REDUCED_MOTION);
    // Listen passively, without calling or probing any permission API.
    // A requestPermission method may exist even when access is already
    // granted. Only valid readings establish that sensors are available;
    // browsers withholding those readings keep the master static.
    const sensorAvailable = !!window.DeviceOrientationEvent;
    const target: Tilt = { x: 0, y: 0 };
    const drawn: Tilt = { x: 0, y: 0 };
    let baseline: Tilt | null = null;
    let subscribed = false;
    let frame = 0;
    let lastFrameAt = 0;
    let idleTimeout: number | null = null;
    let disposed = false;
    let depthReady = false;
    let loadStarted = false;
    let depthLoading = false;
    let pageActive = true;

    const enabled = () =>
      motionAllowed &&
      sensorAvailable &&
      mobile.matches &&
      !reducedMotion.matches &&
      pageActive &&
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
      if (idleTimeout !== null) window.clearTimeout(idleTimeout);
      idleTimeout = null;
      frame = 0;
      lastFrameAt = 0;
      baseline = null;
      target.x = target.y = drawn.x = drawn.y = 0;
      setOffsets(0, 0);
      art.removeAttribute("data-home-motion");
    };

    const animate = (now: number) => {
      frame = 0;
      if (!enabled()) {
        reset();
        return;
      }
      // Time-based inertia: the result does not depend on a 60/90/120 Hz display.
      const elapsed = lastFrameAt ? clamp(now - lastFrameAt, 1, 50) : 16.67;
      lastFrameAt = now;
      const easing = 1 - Math.exp(-elapsed / 140);
      drawn.x += (target.x - drawn.x) * easing;
      drawn.y += (target.y - drawn.y) * easing;
      setOffsets(drawn.x, drawn.y);
      if (
        Math.abs(target.x - drawn.x) > 0.004 ||
        Math.abs(target.y - drawn.y) > 0.004
      ) {
        frame = window.requestAnimationFrame(animate);
      } else {
        lastFrameAt = 0;
      }
    };

    const requestFrame = () => {
      if (!frame) {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(animate);
      }
    };

    const easeToNeutral = () => {
      idleTimeout = null;
      target.x = target.y = 0;
      if (depthReady) requestFrame();
    };

    const activate = () => {
      if (disposed || !enabled() || !baseline || !depthReady) return;
      art.setAttribute("data-home-motion", "active");
      requestFrame();
    };

    const loadDepth = () => {
      if (depthReady) { activate(); return; }
      if (loadStarted) return;
      loadStarted = true;
      depthLoading = true;
      void Promise.all(DEPTH_ASSETS.map(async (src) => {
        const plane = new Image();
        plane.src = src;
        await plane.decode();
      })).then(() => {
        depthLoading = false;
        depthReady = true;
        activate();
      }).catch(() => {
        depthLoading = false;
        // Failed or unavailable optional assets leave the static master.
        // Retry only after a resume or network recovery, never on every sample.
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
      const incomingX = clamp((event.gamma - baseline.x) / 18, -1, 1);
      const incomingY = clamp((event.beta - baseline.y) / 18, -1, 1);
      // Reject small sensor noise; larger tilts use a low-pass filter.
      if (Math.abs(incomingX - target.x) >= 0.035)
        target.x += (incomingX - target.x) * 0.35;
      if (Math.abs(incomingY - target.y) >= 0.035)
        target.y += (incomingY - target.y) * 0.35;

      // Browsers may stop delivering readings while held still. Ease the
      // illustration home instead of leaving it offset indefinitely.
      if (idleTimeout !== null) window.clearTimeout(idleTimeout);
      idleTimeout = window.setTimeout(easeToNeutral, 1100);
      if (depthReady) requestFrame();
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

    const pause = () => {
      pageActive = false;
      reconcile();
    };
    const resume = () => {
      pageActive = true;
      // Installed apps can resume an existing window without remounting React
      // or changing visibility. Re-arm the listener and use a fresh posture.
      if (subscribed) window.removeEventListener("deviceorientation", onOrientation);
      subscribed = false;
      art.removeAttribute("data-home-sensor");
      reset();
      if (!depthReady && !depthLoading) loadStarted = false;
      reconcile();
    };
    const recoverImages = () => {
      if (!depthReady && !depthLoading && enabled()) {
        loadStarted = false;
        // The next valid measurement re-anchors and retries optional images.
        baseline = null;
      }
    };

    mobile.addEventListener("change", reconcile);
    reducedMotion.addEventListener("change", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", recoverImages);
    reconcile();

    return () => {
      disposed = true;
      mobile.removeEventListener("change", reconcile);
      reducedMotion.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", recoverImages);
      if (subscribed) window.removeEventListener("deviceorientation", onOrientation);
      art.removeAttribute("data-home-sensor");
      reset();
    };
  }, [motionAllowed]);

  return (
    <div className="home-art" aria-hidden="true" ref={container} data-depth-assets="ready">
      <div className="home-art-plane home-art-plane--far" />
      <div className="home-art-plane home-art-plane--mid" />
      <div className="home-art-plane home-art-plane--near" />
    </div>
  );
}
