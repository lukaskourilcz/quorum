import "./env.js";
import { validateAgentAvatars } from "./brand/avatars.js";
import { loadAgentRegistry } from "./org/registry.js";
import { loadVentureRegistry } from "./ventures/registry.js";
import { loadVentureAgentControls } from "./ventures/agent-controls.js";

const [registry, ventures, controls] = await Promise.all([
  loadAgentRegistry(),
  loadVentureRegistry(),
  loadVentureAgentControls()
]);
const avatars = await validateAgentAvatars(registry);
const ventureIds = ventures.ventures.map((venture) => venture.id).sort();
const controlIds = Object.keys(controls.ventures).sort();
if (JSON.stringify(ventureIds) !== JSON.stringify(controlIds)) {
  throw new Error("Every registered venture must have one agent-control record");
}
for (const [ventureId, control] of Object.entries(controls.ventures)) {
  for (const agentId of [...control.lockedOn, ...control.switchable]) {
    const agent = registry.agents.find((candidate) => candidate.id === agentId);
    if (!agent || (agent.ventures !== "global" && !agent.ventures.includes(ventureId))) {
      throw new Error(`${agentId} is not assigned to ${ventureId}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      registry: "valid",
      agents: registry.agents.length,
      ventureControls: controlIds.length,
      avatars: avatars.length,
      totalBytes: avatars.reduce((sum, avatar) => sum + avatar.bytes, 0)
    },
    null,
    2
  )
);
