import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import { UserProvider } from "@/components/user-provider";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Qorpera",
  description: "Governed AI Workflow Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${ebGaramond.variable}`}>
      <body className="antialiased">
        <UserProvider>{children}</UserProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
