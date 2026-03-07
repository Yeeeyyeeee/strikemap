import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/I18nContext";
import TelegramToast from "@/components/TelegramToast";

export const metadata: Metadata = {
  title: "StrikeMap — Live US/Israel Iran Tracker",
  description:
    "Live map tracking US/Israel and Iran military activity in real-time",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "StrikeMap — Live US/Israel Iran Tracker",
    description: "Live map tracking US/Israel and Iran military activity in real-time",
    siteName: "StrikeMap",
    url: "https://strikemap.live",
    type: "website",
    images: [
      { url: "https://strikemap.live/og-banner.jpg", width: 1500, height: 500, alt: "StrikeMap — Live Military Conflict Tracker" },
      { url: "https://strikemap.live/og-square.jpg", width: 1000, height: 1000, alt: "StrikeMap Logo" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StrikeMap — Live US/Israel Iran Tracker",
    description: "Live map tracking US/Israel and Iran military activity in real-time",
    images: ["https://strikemap.live/og-banner.jpg"],
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
        <meta name="google-adsense-account" content="ca-pub-5608578086593725" />
        <link rel="apple-touch-icon" href="/icon.png" />
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
        <I18nProvider>
          {children}
          <TelegramToast />
          <Analytics />
        </I18nProvider>
      </body>
    </html>
  );
}
