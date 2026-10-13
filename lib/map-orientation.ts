// A relative gyroscope angle is never a compass. Standard absolute events
// do not expose calibration quality, so this conservative study rejects them.
export type CompassReading = { degrees: number; accuracy: number; source: "magnetic" };
export type CompassEvent = {
  webkitCompassHeading?: number | null;
  webkitCompassAccuracy?: number | null;
  beta?: number | null;
  gamma?: number | null;
};
export const COMPASS_FRESH_MS = 2500;
export const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;
export const angleDifference = (a: number, b: number) => normalizeDegrees(a - b + 180) - 180;
export function readCompass(event: CompassEvent): CompassReading | null {
  const { webkitCompassHeading: heading, webkitCompassAccuracy: accuracy, beta, gamma } = event;
  if (typeof heading !== "number" || !Number.isFinite(heading) || heading < 0 || heading >= 360 ||
      typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 20 ||
      typeof beta !== "number" || !Number.isFinite(beta) || Math.abs(beta) > 60 ||
      typeof gamma !== "number" || !Number.isFinite(gamma) || Math.abs(gamma) > 35) return null;
  return { degrees: heading, accuracy, source: "magnetic" };
}
export type CompassSample = { reading: CompassReading; timestamp: number; count: number };
export function coherentCompass(previous: CompassSample | null, reading: CompassReading, now: number): CompassSample {
  const coherent = previous && now >= previous.timestamp && now - previous.timestamp <= 1000 &&
    Math.abs(angleDifference(reading.degrees, previous.reading.degrees)) <= 25;
  return { reading, timestamp: now, count: coherent ? Math.min(previous.count + 1, 3) : 1 };
}
export function freshCompass(sample: CompassSample | null, now: number): CompassReading | null {
  return sample && sample.count >= 3 && now >= sample.timestamp && now - sample.timestamp <= COMPASS_FRESH_MS
    ? sample.reading : null;
}
