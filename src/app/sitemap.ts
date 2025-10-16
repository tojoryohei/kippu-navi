import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://kippu-navi.com';

    const staticUrls = [
        {
            url: baseUrl,
            lastModified: new Date(),
        },
        {
            url: `${baseUrl}/mr`,
            lastModified: new Date(),
        },
        {
            url: `${baseUrl}/me`,
            lastModified: new Date(),
        },
    ];

    return [...staticUrls];
}