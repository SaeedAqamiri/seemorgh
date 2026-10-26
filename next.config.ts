import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2", "exceljs"],
};

export default nextConfig;
