import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

// Wordmark font (matches the rounded "booknexa" logo lettering). Scoped to the
// Logo component via the CSS variable; the rest of the app keeps the system stack.
const wordmarkFont = Quicksand({
  subsets: ["latin"],
  variable: "--font-wordmark",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BookNexa — The Publishing OS for Amazon KDP",
  description:
    "Research niches, create books, generate covers, package for Amazon KDP, and scale your publishing business from one platform.",
  icons: {
    icon: "/icon-512.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "BookNexa — The Publishing OS for Amazon KDP",
    description:
      "Research niches, create books, generate covers, package for Amazon KDP, and scale your publishing business from one platform.",
    siteName: "BookNexa",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={wordmarkFont.variable}>
      <body>{children}</body>
    </html>
  );
}
