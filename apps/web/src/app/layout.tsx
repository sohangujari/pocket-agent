import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pocket Agent",
  description: "A personal autonomous agent that lives on a server and works from anywhere.",
  applicationName: "Pocket Agent",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pocket Agent", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

const bootScript = `(function(){try{
  var t=localStorage.getItem('pa-theme');
  if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}
  if(localStorage.getItem('pa-lite')==='1'){document.documentElement.classList.add('lite');}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
