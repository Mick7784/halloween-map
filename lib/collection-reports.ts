import { z } from "zod";
export const reportSchema = z
  .object({
    id: z.uuid(),
    seasonId: z.uuid(),
    event: z.enum(["start", "finish"]),
    visited: z.number().int().min(0).max(30).default(0),
    planned: z.number().int().min(1).max(30),
    distanceMeters: z.number().finite().min(0).max(200000).default(0),
    durationSeconds: z.number().finite().min(0).max(86400).default(0),
  })
  .refine((v) => v.visited <= v.planned);
export type CollectionReport = z.infer<typeof reportSchema>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export const reportQueueKey = (ownerId: string, instanceId: string) =>
  "halloween.collection-reports:" + JSON.stringify([ownerId, instanceId]);
export function queuedReports(
  storage: Storage,
  key: string,
): CollectionReport[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const reports = z.array(reportSchema).safeParse(JSON.parse(raw));
  if (!reports.success) throw new Error("File de rapports locale invalide");
  return reports.data;
}
function save(storage: Storage, key: string, reports: CollectionReport[]) {
  if (reports.length) storage.setItem(key, JSON.stringify(reports));
  else storage.removeItem(key);
}
export function enqueueReport(
  storage: Storage,
  key: string,
  input: CollectionReport,
) {
  const report = reportSchema.parse(input),
    reports = queuedReports(storage, key);
  const previous = reports.find((r) => r.id === report.id);
  // A finish replaces its start; restoring an active route must never overwrite a finish.
  if (previous?.event === "finish" && report.event === "start") return;
  save(storage, key, [...reports.filter((r) => r.id !== report.id), report]);
}
const sending = new Map<string, Promise<void>>();
export function flushReports(
  storage: Storage,
  key: string,
  send: (report: CollectionReport) => Promise<unknown>,
  isCurrent = () => true,
) {
  const existing = sending.get(key);
  if (existing) return existing;
  const job = (async () => {
    for (const report of queuedReports(storage, key)) {
      if (!isCurrent()) break;
      try {
        const acknowledgement = await send(report);
        if (
          !acknowledgement ||
          typeof acknowledgement !== "object" ||
          !("ok" in acknowledgement) ||
          acknowledgement.ok !== true
        )
          continue;
      } catch {
        continue;
      }
      // Do not acknowledge a newer finish queued while the start was in flight.
      save(
        storage,
        key,
        queuedReports(storage, key).filter(
          (r) => JSON.stringify(r) !== JSON.stringify(report),
        ),
      );
    }
  })().finally(() => sending.delete(key));
  sending.set(key, job);
  return job;
}
