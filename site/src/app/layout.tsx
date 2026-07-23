import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans"
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  description:
    "Daily standups, public decisions and measurable outcomes from an agent-operated company.",
  openGraph: {
    description:
      "Daily standups, public decisions and measurable outcomes from an agent-operated company.",
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
    <html lang="en">
      <body className={dmSans.variable}>{children}</body>
    </html>
  );
}
