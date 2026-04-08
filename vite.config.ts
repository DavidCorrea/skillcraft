import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL ?? '').replace(/\/$/, '')
  const ogImage = siteUrl ? `${siteUrl}/og.png` : '/og.png'
  const canonicalMeta = siteUrl
    ? `    <link rel="canonical" href="${siteUrl}/" />\n    <meta property="og:url" content="${siteUrl}/" />`
    : ''

  return {
    plugins: [
      react(),
      {
        name: 'html-meta-site-url',
        transformIndexHtml(html) {
          return html
            .replaceAll('__OG_IMAGE__', ogImage)
            .replace('__EXTRA_CANONICAL_META__', canonicalMeta)
        },
      },
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
