import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse e suas dependências nativas não devem passar pelo bundler do Next.js.
  serverExternalPackages: ["pdf-parse", "canvas", "@napi-rs/canvas"],

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
    
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  
};

export default nextConfig;
