"use client";
import { useEffect } from "react";
import { flushReports, reportQueueKey } from "../lib/collection-reports";
import { api } from "./common";
// Mounted for every authenticated application page, independently of the active route.
export default function useCollectionReports(
  ownerId?: string,
  instanceId?: string,
) {
  useEffect(() => {
    if (!ownerId || !instanceId) return;
    const key = reportQueueKey(ownerId, instanceId);
    let active = true;
    const send = () => {
      try {
        void flushReports(
          localStorage,
          key,
          (report) => api("collection/report", report),
          () => active,
        ).catch(() => {});
      } catch {
        /* Local storage may be disabled by the browser. */
      }
    };
    send();
    const retry = setInterval(send, 60000);
    window.addEventListener("online", send);
    window.addEventListener("collection-report-queued", send);
    window.addEventListener("pageshow", send);
    const resume = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      clearInterval(retry);
      window.removeEventListener("online", send);
      window.removeEventListener("collection-report-queued", send);
      window.removeEventListener("pageshow", send);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [ownerId, instanceId]);
}
