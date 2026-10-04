import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Halloween · Carte des maisons",
  description:
    "Découvrez les maisons participantes et préparez votre parcours Halloween.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
