/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow CI/local verification to build away from a running dev server's .next directory.
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'production' ? '.next-build' : '.next'),
  // Docker 镜像使用 distDir 下的 standalone 产物，本地 npm start 不受影响
  output: 'standalone',
};

export default nextConfig;
