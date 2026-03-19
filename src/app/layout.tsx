import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AiChatProvider } from "@/contexts/ai-chat-context";
import { AiChatWidget } from "@/components/ai/ai-chat-widget";

const soraSans = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://app.rentalenergia.com.br",
  ),
  title: {
    default: "Rental Energia",
    template: "%s | Rental Energia",
  },
  description: "Plataforma Rental Energia para gestao comercial, energia e financeiro.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${soraSans.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <AiChatProvider>
          {children}
          <AiChatWidget />
          <SpeedInsights />
        </AiChatProvider>
      </body>
    </html>
  );
}
