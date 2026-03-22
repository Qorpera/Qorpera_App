import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@prisma/client", "prisma", "pdf-parse", "mammoth", "xlsx", "papaparse", "docx"],
  },
};

const intlConfig = withNextIntl(nextConfig);

const sentryConfig = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(intlConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : intlConfig;

export default sentryConfig;
