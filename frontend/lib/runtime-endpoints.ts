function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    hostname.toLowerCase(),
  );
}

export function resolveBrowserEndpoint(
  configured: string | undefined,
  sameOriginFallback: string,
  browserOrigin =
    typeof window === "undefined" ? undefined : window.location.origin,
): string {
  const value = configured?.trim() || sameOriginFallback;
  if (!browserOrigin || value.startsWith("/")) return value.replace(/\/$/, "");

  try {
    const target = new URL(value);
    const browser = new URL(browserOrigin);
    if (isLoopback(target.hostname) && !isLoopback(browser.hostname)) {
      return sameOriginFallback.replace(/\/$/, "");
    }
  } catch {
    return sameOriginFallback.replace(/\/$/, "");
  }
  return value.replace(/\/$/, "");
}

export function publicApiBaseUrl(): string {
  return resolveBrowserEndpoint(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    "/api",
  );
}

export function publicRealtimeUrl(): string {
  return resolveBrowserEndpoint(
    process.env.NEXT_PUBLIC_REALTIME_URL,
    "/call-center",
  );
}
