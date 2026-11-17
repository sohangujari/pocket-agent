import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pocket/core", "@pocket/db", "@pocket/tools", "@pocket/shared"],
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  webpack(config, { nextRuntime }) {
    config.resolve = config.resolve ?? {};

    // Workspace packages use NodeNext-style `./file.js` specifiers that resolve
    // to `./file.ts` sources. TypeScript understands that; webpack needs to be
    // told explicitly.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };

    // `instrumentation.ts` is compiled for both the Node and Edge runtimes.
    // The worker it loads is Node-only (fs, path, postgres) and the edge branch
    // returns before it is ever reached. Stub the import for the edge pass so
    // its Node-only module graph is never built.
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "./lib/worker": false,
      };
    }

    return config;
  },
};

export default nextConfig;
