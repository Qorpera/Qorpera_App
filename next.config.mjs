/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@prisma/client", "prisma", "pdf-parse", "mammoth", "xlsx", "papaparse"],
  },
};

export default nextConfig;
