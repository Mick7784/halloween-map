import { expect, it, vi } from "vitest";
import {
  enqueueReport,
  flushReports,
  queuedReports,
  reportQueueKey,
  type CollectionReport,
} from "../lib/collection-reports";
const key = reportQueueKey("owner", "instance");
const report: CollectionReport = {
  id: "10000000-0000-4000-8000-000000000001",
  seasonId: "30000000-0000-4000-8000-000000000001",
  event: "finish",
  planned: 3,
  visited: 2,
  distanceMeters: 1200,
  durationSeconds: 900,
};
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
it("persists aggregate-only finishes independently of route state until acknowledged", async () => {
  const local = storage();
  enqueueReport(local, key, {
    ...report,
    geometry: [[1, 2]],
    positions: [[2, 3]],
  } as CollectionReport);
  expect(local.getItem(key)).not.toMatch(/geometry|positions/);
  const offline = vi.fn().mockRejectedValue(new Error("offline"));
  await flushReports(local, key, offline);
  local.removeItem("halloween.active-route");
  expect(queuedReports(local, key)).toEqual([report]);
  const ack = vi.fn().mockResolvedValue({ ok: true });
  await flushReports(local, key, ack);
  expect(ack).toHaveBeenCalledWith(report);
  expect(queuedReports(local, key)).toEqual([]);
});
it("does not drop a finish queued while the start is in flight and serializes retries", async () => {
  const local = storage();
  enqueueReport(local, key, { ...report, event: "start" });
  let resolve!: () => void;
  const send = vi.fn(
    () =>
      new Promise<{ ok: true }>((r) => {
        resolve = () => r({ ok: true });
      }),
  );
  const job = flushReports(local, key, send);
  const other = flushReports(local, key, send);
  enqueueReport(local, key, report);
  resolve();
  await Promise.all([job, other]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(queuedReports(local, key)).toEqual([report]);
  await flushReports(local, key, async () => ({ ok: true }));
  expect(queuedReports(local, key)).toEqual([]);
});
it("coalesces duplicate reports, preserves finish on restore and isolates accounts and instances", () => {
  const local = storage();
  enqueueReport(local, key, report);
  enqueueReport(local, key, report);
  enqueueReport(local, key, { ...report, event: "start" });
  expect(queuedReports(local, key)).toEqual([report]);
  expect(queuedReports(local, reportQueueKey("other", "instance"))).toEqual([]);
  expect(queuedReports(local, reportQueueKey("owner", "other"))).toEqual([]);
});

it("keeps reports pending when the response does not acknowledge them", async () => {
  const local = storage();
  enqueueReport(local, key, report);
  await flushReports(local, key, async () => ({ ok: false }));
  expect(queuedReports(local, key)).toEqual([report]);
});
