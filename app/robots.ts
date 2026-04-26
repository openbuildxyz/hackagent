import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/dashboard/', '/auth/'] },
    ],
    sitemap: 'https://hackathon.xyz/sitemap.xml',
    host: 'https://hackathon.xyz',
  }
}
