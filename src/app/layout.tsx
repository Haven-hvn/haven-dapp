import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Web3ModalProvider } from "@/components/providers/Web3ModalProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { LitProvider } from "@/components/providers/LitProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeScript } from "@/components/providers/ThemeScript";
import { ErrorProvider } from "@/components/providers/ErrorProvider";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { WebVitals } from "@/components/analytics/WebVitals";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Haven - Decentralized Video Library",
    template: "%s | Haven",
  },
  description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Lit Protocol.",
  keywords: [
    "web3",
    "video",
    "ipfs",
    "filecoin",
    "lit protocol",
    "encrypted",
    "decentralized",
    "video library",
    "encrypted video",
    "decentralized storage",
    "web3 video",
    "crypto video",
  ],
  authors: [{ name: "Haven" }],
  creator: "Haven",
  publisher: "Haven",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://haven.video"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Haven",
    title: "Haven - Decentralized Video Library",
    description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Lit Protocol.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Haven - Decentralized Video Library",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Haven - Decentralized Video Library",
    description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Lit Protocol.",
    images: ["/og-image.png"],
    creator: "@havenvideo",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: "#5bbad5",
      },
    ],
  },
  manifest: "/site.webmanifest",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="dns-prefetch" href="https://ipfs.io" />
        <link rel="dns-prefetch" href="https://gateway.lighthouse.storage" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="dark" enableSystem>
          <ThemeScript />
          <QueryProvider>
            <Web3ModalProvider>
              <AuthProvider>
                <LitProvider>
                  <ErrorProvider>
                    {children}
                  </ErrorProvider>
                </LitProvider>
              </AuthProvider>
            </Web3ModalProvider>
          </QueryProvider>
        </ThemeProvider>
        <VercelAnalytics />
        <WebVitals />
      </body>
    </html>
  );
}
