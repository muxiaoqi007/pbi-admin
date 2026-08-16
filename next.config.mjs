/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 镜像使用 standalone 产物（.next/standalone），本地 npm start 不受影响
  output: 'standalone',
};

export default nextConfig;
