import "../globals.css";

import type { Metadata, Viewport } from "next";
import { cacheLife } from "next/cache";
import localFont from "next/font/local";
import { locale as localeParam } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MotionProvider } from "@/components/motion/motion-provider";
import { routing } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/site";
import { themeInitScript } from "@/lib/theme/constants";

// Inter variable font with the optical-size axis: large sizes render as Inter Display.
const inter = localFont({
  src: "../fonts/inter-latin-opsz.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
    applicationName: t("siteName"),
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("title"),
      description: t("description"),
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060D1A" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
};

async function getCurrentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await localeParam();
  if (!hasLocale(routing.locales, locale)) notFound();

  const [t, year] = await Promise.all([getTranslations("Common"), getCurrentYear()]);

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <MotionProvider>
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-accent-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              {t("skipToContent")}
            </a>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter year={year} />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
