/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://rhclothing-v1.vercel.app/api/:path*',
      },
    ];
  },
};

export default nextConfig;
