import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Youth Choir Week 2026 · Eket, Akwa Ibom State",
  description: "You’re invited: five days, four venues across Eket and Ikot Abasi. Leadership Session, Movie Night, Excursion, Games Night, and Dinner & Awards.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#080b20", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
