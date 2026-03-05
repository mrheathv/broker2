/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Images: disable optimization for static export
  images: { unoptimized: true },
};

export default nextConfig;
