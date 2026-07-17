import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://kippu-navi.com';

    return [
        {
            url: baseUrl,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/mr`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/split`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/split-pass`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/split-icpass`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/logic`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/guide`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/changelog`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/about`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date('2025-09-01T00:00:00+09:00'),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: new Date('2025-09-01T00:00:00+09:00'),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/articles`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/articles/what-is-split-ticket`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/articles/how-to-buy-split-ticket`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/articles/commuter-pass-savings`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/articles/jr-fare-system`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/articles/merit-demerit`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/articles/popular-routes`,
            lastModified: new Date('2026-07-18T00:00:00+09:00'),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
    ];
}
