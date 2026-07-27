const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/storage/**",
      },
            {
        protocol: "http",
        hostname: "jun.local",
        port: "8000",
        pathname: "/storage/**",
      },
      {
        protocol: "https",
        hostname: "api.dqx-tool.com",
        pathname: "/storage/**",
      },
    ],
  },

};

module.exports = withNextIntl(nextConfig);