import { validateAgentAvatars } from "./brand/avatars.js";
import { loadAgentRegistry } from "./org/registry.js";

const registry = await loadAgentRegistry();
const avatars = await validateAgentAvatars(registry);

console.log(
  JSON.stringify(
    {
      registry: "valid",
      agents: registry.agents.length,
      avatars: avatars.length,
      totalBytes: avatars.reduce((sum, avatar) => sum + avatar.bytes, 0)
    },
    null,
    2
  )
);
