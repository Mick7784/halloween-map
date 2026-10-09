import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";
import "../components/ReleaseDesign.css";
import { InstallAppProvider } from "../components/InstallApp";
export const viewport: Viewport = {
  themeColor: "#17171e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
export const metadata: Metadata = {
  referrer: "no-referrer",
  applicationName: "Halloween Map",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Halloween Map",
  },
  icons: { icon: "/favicon.svg", apple: "/pwa/apple-touch-icon.png" },
  title: "Halloween · Carte des maisons",
  description:
    "Découvrez les maisons participantes et préparez votre parcours Halloween.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <InstallAppProvider>{children}</InstallAppProvider>
      </body>
    </html>
  );
}
