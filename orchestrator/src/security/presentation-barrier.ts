const presentationOnlyPatterns = [
  /site\/(?:src\/)?show(?:\/|$)/iu,
  /show[-_ ]config/iu,
  /sitcom(?:[-_ ]skin)?/iu,
  /workplace[-_ ]show/iu,
  /site visitors?/iu,
  /page[ -]?views?/iu,
  /reader analytics/iu,
  /audience analytics/iu
] as const;

export function assertAgentPacketPresentationBarrier(value: unknown): void {
  const packet = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = presentationOnlyPatterns.find((pattern) => pattern.test(packet));
  if (forbidden) {
    throw new Error(
      `Agent packet crossed the public-presentation barrier (${forbidden.source})`
    );
  }
}

export function packetCrossesPresentationBarrier(value: unknown): boolean {
  try {
    assertAgentPacketPresentationBarrier(value);
    return false;
  } catch {
    return true;
  }
}
