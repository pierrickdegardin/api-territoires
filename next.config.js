/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only, pas de pages React
  output: 'standalone',

  // Désactiver les fonctionnalités non utilisées
  reactStrictMode: false,

  // Headers CORS pour API publique
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-API-Key' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
