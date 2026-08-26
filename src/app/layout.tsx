import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ContextProvider from '@/context';
import { AuthProvider } from "@/components/providers/AuthProvider";
import { HavenAolProvider } from "@/components/providers/HavenAolProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeScript } from "@/components/providers/ThemeScript";
import { ErrorProvider } from "@/components/providers/ErrorProvider";
import { ServiceWorkerProvider } from "@/components/providers/ServiceWorkerProvider";
import { SecurityCleanupProvider } from "@/components/providers/SecurityCleanupProvider";
import { CacheProvider } from "@/components/providers/CacheProvider";
import { HydrationNavBridge } from "@/components/providers/HydrationNavBridge";
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
const newsreader = localFont({
  src: [
    {
      path: "./fonts/NewsreaderVF-latin.woff2",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "./fonts/NewsreaderVF-Italic-latin.woff2",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: {
    default: "Haven - Decentralized Video Library",
    template: "%s | Haven",
  },
  description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Haven-AOL.",
  keywords: [
    "web3",
    "video",
    "ipfs",
    "filecoin",
    "haven-aol",
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
    description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Haven-AOL.",
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
    description: "Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Haven-AOL.",
    images: ["/og-image.png"],
    creator: "@havenvideo",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
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
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#16161d" },
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
        {/*
          Early-click guard (static-export / IPFS gateways).
          Extensionless internal links clicked before React hydrates would
          navigate to a gateway directory listing ("Index of …"). This
          capture-phase listener queues such clicks; HydrationNavBridge
          replays them through the router once hydration lands, with a
          hard fallback to the flat `.html` file if hydration never does.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(window.__havenEarlyClickGuard)return;window.__havenEarlyClickGuard=true;window.addEventListener("click",function(e){if(window.__havenHydrated)return;if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var t=e.target;var a=t&&t.closest?t.closest("a[href]"):null;if(!a||a.target==="_blank"||a.hasAttribute("download"))return;var href=a.getAttribute("href")||"";if(!href||href.charAt(0)==="#")return;var url=new URL(a.href,location.href);if(url.origin!==location.origin)return;var path=url.pathname;if(path==="/")return;if(/\\/[^/]*\\.[^/]+$/.test(path))return;e.preventDefault();e.stopImmediatePropagation();if(!window.__havenPendingNav){window.__havenPendingNav={path:path+url.search,fallback:path.replace(/\\/+$/,"")+".html"+url.search};setTimeout(function(){if(!window.__havenHydrated&&window.__havenPendingNav){location.href=window.__havenPendingNav.fallback}},5000)}},true)})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="light" enableSystem>
          <ThemeScript />
          <ServiceWorkerProvider>
            <ContextProvider>
              <SecurityCleanupProvider>
                <CacheProvider>
                  <AuthProvider>
                    <HavenAolProvider>
                      <ErrorProvider>
                        <div className="material-grain" aria-hidden="true" />
                        {children}
                        <HydrationNavBridge />
                      </ErrorProvider>
                    </HavenAolProvider>
                  </AuthProvider>
                </CacheProvider>
              </SecurityCleanupProvider>
            </ContextProvider>
          </ServiceWorkerProvider>
        </ThemeProvider>
        <WebVitals />
      </body>
    </html>
  );
}
