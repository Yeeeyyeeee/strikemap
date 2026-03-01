import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/I18nContext";

export const metadata: Metadata = {
  title: "StrikeMap — Live Military Strike Tracker",
  description:
    "Live map tracking military strikes on targets worldwide in real-time",
  openGraph: {
    title: "StrikeMap — Live Military Strike Tracker",
    description: "Live map tracking military strikes in real-time",
    siteName: "StrikeMap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StrikeMap — Live Military Strike Tracker",
    description: "Live map tracking military strikes in real-time",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ef4444" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="StrikeMap" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
