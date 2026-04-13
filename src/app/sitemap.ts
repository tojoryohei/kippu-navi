import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://kippu-navi.com';
    const lastModified = new Date();

    return [
        {
            url: baseUrl,
            lastModified,
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/split`,
            lastModified,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/mr`,
            lastModified,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/logic`,
            lastModified,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/changelog`,
            lastModified,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/about`,
            lastModified,
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified,
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified,
            changeFrequency: 'yearly',
            priority: 0.5,
        },
    ];
}