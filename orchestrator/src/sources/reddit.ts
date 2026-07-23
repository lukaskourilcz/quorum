export const REDDIT_SOURCE_STATUS = {
  enabled: false,
  reason:
    "Authenticated Reddit Data API access requires separate credentials, policy review and HUMAN_APPROVAL."
} as const;

export function assertRedditSourceDisabled(): never {
  throw new Error(REDDIT_SOURCE_STATUS.reason);
}
