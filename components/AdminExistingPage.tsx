"use client";
import { useEffect, useState, type ComponentProps } from "react";
import type { User, Instance } from "../lib/domain";

import { api, Notice } from "./common";
import ContentAdmin from "./ContentAdmin";
import EventSettings from "./EventSettings";
type Content = ComponentProps<typeof ContentAdmin>["data"];
export default function AdminExistingPage({
  section,
  mapStyle,
  refresh,
}: {
  section: string;
  mapStyle: string;
  user: User;
  refresh: () => Promise<void>;
}) {
  const [content, setContent] = useState<Content | null>(null),
    [settings, setSettings] = useState<Instance | null>(null),
    [error, setError] = useState("");
  async function reloadContent() {
    setContent(await api<Content>("admin/content"));
  }
  useEffect(() => {
    let live = true;
    const load =
      section === "content"
        ? api<Content>("admin/content")
        : section === "settings"
          ? api<Instance>("admin/settings")
          : Promise.resolve(null);
    void load
      .then((data) => {
        if (!live) return;
        if (section === "content") setContent(data as Content);
        else if (section === "settings") setSettings(data as Instance);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [section]);
  return (
    <>
      <Notice error={error} />
      {section === "content" && content ? (
        <ContentAdmin data={content} reload={reloadContent} />
      ) : section === "settings" && settings ? (
        <EventSettings
          instance={settings}
          mapStyle={mapStyle}
          save={async (payload) => {
            await api("admin", { action: "settings", payload });
            setSettings(await api<Instance>("admin/settings"));
            await refresh();
          }}
        />
      ) : (
        !error && <p role="status">Chargement…</p>
      )}
    </>
  );
}
