const localApiOrigin = process.env.NODE_ENV === "development" ? "http://localhost:8080" : "";

export function getApiUrl(path: string): string {
    const configuredOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "");
    return `${configuredOrigin || localApiOrigin}${path}`;
}
