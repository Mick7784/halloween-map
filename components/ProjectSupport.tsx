"use client";
import { useState } from "react";
import { Heart, X } from "lucide-react";
import { publicProjectLinks, type ProjectLinks } from "../lib/project-links";
import "./ProjectSupport.css";
export default function ProjectSupport({
  settings,
}: {
  settings?: ProjectLinks;
}) {
  const [open, setOpen] = useState(false);
  const links = publicProjectLinks(settings);
  if (links.supportEnabled === false) return null;
  return (
    <>
      {links.supportUrl ? (
        <a
          className="project-support-link"
          href={links.supportUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Heart size={13} /> Soutenir le projet
        </a>
      ) : (
        <button
          className="project-support-link"
          type="button"
          onClick={() => setOpen(true)}
        >
          <Heart size={13} /> Soutenir le projet
        </button>
      )}
      {open && (
        <div
          className="project-support-backdrop"
          onClick={() => setOpen(false)}
        >
          <section
            className="project-support-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-support-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              type="button"
              aria-label="Fermer le soutien au projet"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <h2 id="project-support-title">Soutenir le projet</h2>
            <p>
              Merci de votre intérêt pour Halloween Map. Un lien de soutien sera
              proposé ici lorsqu’il sera disponible.
            </p>
            <a
              href={`mailto:${links.bugEmail}?subject=${encodeURIComponent("Halloween Map — Soutenir le projet")}`}
            >
              Nous contacter pour proposer votre soutien
            </a>
          </section>
        </div>
      )}
    </>
  );
}
