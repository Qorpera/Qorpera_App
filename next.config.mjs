import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@prisma/client", "prisma", "pdf-parse", "mammoth", "xlsx", "papaparse", "docx"],
  },
};

const sentryConfig = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;

export default sentryConfig;
