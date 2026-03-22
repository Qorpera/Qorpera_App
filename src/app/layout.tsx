import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${ebGaramond.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <UserProvider>{children}</UserProvider>
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
