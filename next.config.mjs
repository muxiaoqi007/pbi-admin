/** @type {import('next').NextConfig} */
const nextConfig = {
  // 统一用 .next 目录，避免 distDir 分裂导致 start 找不到 build 产物
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
};

export default nextConfig;
