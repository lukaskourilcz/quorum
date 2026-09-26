export function formatPhaseLabel(phase: string) {
  // Retired phases keep their labels: the records those shifts wrote are still on file and still
  // render, and a finished meeting named by its raw phase id is a meeting nobody can read.
  const phaseLabels: Record<string, string> = {
    afternoon: "Afternoon company meeting",
    am: "Morning meeting · old label",
    founding: "Founding",
    morning: "Morning company meeting",
    night: "Night company meeting",
    "cu-day": "DNESKAi daily desk",
    "cu-edition": "DNESKAi edition production",
    "cu-product": "DNESKAi product meeting",
    "mma-day": "MMA Files daily desk",
    "dm-day": "Door Money daily desk",
    pm: "Afternoon meeting · old label"
  };

  return phaseLabels[phase] ?? phase;
}
