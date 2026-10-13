import { describe, expect, it } from "vitest";
import { angleDifference, coherentCompass, freshCompass, normalizeDegrees, readCompass } from "../lib/map-orientation";
const event = { webkitCompassHeading: 90, webkitCompassAccuracy: 8, beta: 20, gamma: 0 };
describe("map compass quality and circular geometry", () => {
  it("accepts calibrated magnetic readings without pretending they are true north", () => {
    expect(readCompass(event)).toEqual({ degrees: 90, accuracy: 8, source: "magnetic" });
    expect(readCompass({ ...event, webkitCompassHeading: 0, webkitCompassAccuracy: 0 })).not.toBeNull();
  });
  it.each([-1, 21, NaN, Infinity, null, undefined])("rejects absent or unusable compass accuracy %s", (accuracy) => {
    expect(readCompass({ ...event, webkitCompassAccuracy: accuracy })).toBeNull();
  });
  it.each([-1, 360, NaN, Infinity, null, undefined])("rejects absent or invalid heading %s", (heading) => {
    expect(readCompass({ ...event, webkitCompassHeading: heading })).toBeNull();
  });
  it("never converts relative alpha, GPS travel heading, or unqualified absolute orientation", () => {
    expect(readCompass({ beta: 0, gamma: 0 })).toBeNull();
    expect(readCompass({ ...event, webkitCompassHeading: undefined })).toBeNull();
  });
  it("rejects a nearly vertical or heavily rolled device", () => {
    expect(readCompass({ ...event, beta: 90 })).toBeNull();
    expect(readCompass({ ...event, gamma: 40 })).toBeNull();
    expect(readCompass({ ...event, beta: NaN })).toBeNull();
  });
  it("requires three coherent samples and respects the north crossing", () => {
    const a = coherentCompass(null, { degrees: 358, accuracy: 8, source: "magnetic" }, 100);
    const b = coherentCompass(a, { ...a.reading, degrees: 1 }, 200);
    const c = coherentCompass(b, { ...b.reading, degrees: 4 }, 300);
    expect(freshCompass(b, 300)).toBeNull();
    expect(freshCompass(c, 300)?.degrees).toBe(4);
    expect(angleDifference(1, 358)).toBe(3);
    expect(normalizeDegrees(5 - 30)).toBe(335);
  });
  it("drops jumps, gaps, old samples and backwards clocks", () => {
    const reading = readCompass(event)!;
    const a = coherentCompass(null, reading, 100);
    const b = coherentCompass(a, reading, 200);
    const c = coherentCompass(b, reading, 300);
    expect(coherentCompass(c, { ...reading, degrees: 180 }, 400).count).toBe(1);
    expect(coherentCompass(c, reading, 1400).count).toBe(1);
    expect(coherentCompass(c, reading, 200).count).toBe(1);
    expect(freshCompass(c, 2801)).toBeNull();
    expect(freshCompass(c, 200)).toBeNull();
  });
});
