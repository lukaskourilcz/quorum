import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { getPublicSiteUrl } from "@/lib/public-site-url";
import "./globals.css";

const dmSans = DM_Sans({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans"
});

const ibmPlexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  description:
    "Three daily shifts, public decisions and measurable outcomes from an agent-operated company.",
  openGraph: {
    description:
      "Three daily shifts, public decisions and measurable outcomes from an agent-operated company.",
    images: ["/opengraph-image"],
    siteName: "BoardlessAI",
    title: "BoardlessAI",
    type: "website"
  },
  robots: {
    follow: true,
    index: true
  },
  title: {
    default: "BoardlessAI",
    template: "%s · BoardlessAI"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body className={`${dmSans.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
