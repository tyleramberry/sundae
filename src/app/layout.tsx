import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Climate_Crisis,
  Geist,
  Geist_Mono,
} from "next/font/google";
import "./globals.css";
import { getLandingUrl } from "@/lib/appUrl";
import PostHogProvider from "@/components/PostHogProvider";
import MetaPixel from "@/components/MetaPixel";
import MetaEvents from "@/components/MetaEvents";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Marketing display type (see the "Landing type" block in globals.css).
// Bricolage Grotesque is the headline face -- the width axis is loaded so
// headlines can be set condensed and heavy. Climate Crisis is the brand's
// "melting" face: its one axis (YEAR) literally melts the letterforms, and
// it's only ever used for a word or two (the wordmark, one headline word).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const climate = Climate_Crisis({
  variable: "--font-climate",
  subsets: ["latin"],
  axes: ["YEAR"],
});

const TITLE = "Sundae — AI-guided weekly planning";
const DESCRIPTION =
  "Define the roles you play, and Sundae turns them into a real week on your Google Calendar. One guided session a week. Nothing gets scheduled until you confirm it.";

// `metadataBase` is what makes the relative OG image URL that
// src/app/opengraph-image.tsx generates resolve to an absolute one --
// without it Next warns and social crawlers get a path they can't fetch.
// Every link to this app gets shared somewhere social (that's the whole
// distribution plan), so a bare unfurl is a real cost.
//
// getLandingUrl() (src/lib/appUrl.ts) returns the marketing domain
// (sundaeplanner.com) so social unfurls point to the landing page, not
// the app subdomain.
export const metadata: Metadata = {
  metadataBase: new URL(getLandingUrl()),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: getLandingUrl(),
    siteName: "Sundae",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  verification: {
    google: "vlizNZuaCni9DNRkq0OS7fDXQ1cCS5ODksb1MtH-7GY",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} ${climate.variable} h-full antialiased`}
    >
      {/* `min-h-full`, NOT `h-full overflow-hidden`. The viewport-pinned,
          never-scrolls behavior belongs to the signed-in shell only -- it
          lives in src/app/(app)/layout.tsx, which pins itself to `h-dvh`
          rather than inheriting a capped height from here. Putting
          `overflow-hidden` on <body> applied it to *every* route, which
          silently clipped the marketing page: on a 375x667 phone the
          landing page's primary CTA sat at y=697 with no way to scroll to
          it, and the footer's Privacy/Terms links -- which Google's OAuth
          verification for the sensitive calendar scope requires to be
          reachable from the homepage -- never rendered on any laptop. */}
      <body className="flex min-h-full flex-col">
        <MetaPixel />
        <PostHogProvider>
          <MetaEvents />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
