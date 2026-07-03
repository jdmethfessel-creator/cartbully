import type { Metadata } from "next";
import { Permanent_Marker, Space_Grotesk } from "next/font/google";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import "./globals.css";

const marker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marker",
  display: "swap",
});

const body = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "CartBully, the bully on your side",
    template: "%s | CartBully",
  },
  description:
    "Paste a product link and a bully renders a verdict. Trashed, spared, or a swap. Cheaper than whatever you were about to buy.",
  openGraph: {
    title: "CartBully",
    description: "It picks on your cart, not you.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CartBully",
    description: "It picks on your cart, not you.",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${marker.variable} ${body.variable}`}>
      <body className="min-h-screen bg-hallway text-ink">
        <div className="mx-auto max-w-[480px] min-h-screen bg-paper shadow-2xl flex flex-col">
          <NavBar />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
