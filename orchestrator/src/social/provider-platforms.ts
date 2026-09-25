/**
 * Which provider may send to which platform, and nothing else (quorum#571).
 *
 * Two providers have a publish adapter: Direct Meta for Instagram and Threads (`meta.ts`) and
 * Buffer for LinkedIn only (`buffer.ts`). Buffer's API could reach Instagram and Threads too; this
 * map is what keeps it off them, so the Meta core stays the one transport for those two. A
 * provider missing from the map has no adapter, and a connection on it stays held.
 *
 * Its own module because both the target resolver and the provider registry read it, and the
 * registry already imports the resolver.
 */
export const PROVIDER_SEND_PLATFORMS = {
  "direct-meta": ["instagram", "threads"],
  buffer: ["linkedin"]
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type PublishProviderId = keyof typeof PROVIDER_SEND_PLATFORMS;

export function hasPublishAdapter(providerId: string): providerId is PublishProviderId {
  return Object.hasOwn(PROVIDER_SEND_PLATFORMS, providerId);
}

export function providerMaySend(providerId: string, platform: string): providerId is PublishProviderId {
  return hasPublishAdapter(providerId)
    && (PROVIDER_SEND_PLATFORMS[providerId] as readonly string[]).includes(platform);
}
