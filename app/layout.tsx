import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";
import "../components/ReleaseDesign.css";
import "../components/PremiumApp.css";
import { InstallAppProvider } from "../components/InstallApp";
export const viewport: Viewport = {
  themeColor: "#080b18",
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
  icons: {
    icon: [
      { url: "/favicon-32.png?v=095", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png?v=095", type: "image/png", sizes: "16x16" },
    ],
    apple: "/pwa/apple-touch-icon.png?v=095",
  },
  title: "Halloween Map · Maisons participantes",
  description:
    "Consultez la carte des maisons participantes et suivez individuellement votre collecte de bonbons.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="hm-premium">
        <InstallAppProvider>{children}</InstallAppProvider>
      </body>
    </html>
  );
}
