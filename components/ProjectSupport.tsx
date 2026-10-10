"use client";
import { Heart } from "lucide-react";
import {
  publicProjectLinks,
  supportHref,
  type ProjectLinks,
} from "../lib/project-links";
import "./ProjectSupport.css";
export default function ProjectSupport({
  settings,
}: {
  settings?: ProjectLinks;
}) {
  const links = publicProjectLinks(settings),
    href = supportHref(links);
  if (!href) return null;
  return (
    <a
      className="project-support-link"
      href={href}
      target={href.startsWith("https:") ? "_blank" : undefined}
      rel={href.startsWith("https:") ? "noopener noreferrer" : undefined}
    >
      <Heart size={13} /> Soutenir le projet
    </a>
  );
}
