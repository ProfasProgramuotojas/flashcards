import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlashDojo — IB Study Cards",
  description:
    "Ace your IB exams. Flashcards for Economics, Biology, Chemistry and Mathematics — with SL/HL filtering, topic selection, and smart progress tracking.",
  keywords: ["IB", "flashcards", "study", "economics", "biology", "chemistry", "mathematics", "SL", "HL", "revision"],
  authors: [{ name: "FlashDojo" }],
  openGraph: {
    title: "FlashDojo — IB Study Cards",
    description:
      "Ace your IB exams. SL & HL flashcards for Economics, Biology, Chemistry and Maths with smart progress tracking.",
    url: "https://flashdojo.app",
    siteName: "FlashDojo",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FlashDojo — IB Study Cards",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FlashDojo — IB Study Cards",
    description:
      "Ace your IB exams. SL & HL flashcards with smart progress tracking.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  themeColor: "#0f0f14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}