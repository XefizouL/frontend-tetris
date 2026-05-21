/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Esto es vital para subirlo a S3 sin gastar en servidores
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['tetris.prismabitetesting.xyz', 'tetris.localhost'],
};

export default nextConfig;