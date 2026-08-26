import "server-only";
import ventureRegistrySource from "../../../config/ventures.json";
import type { Agent } from "@/data/agents";

const publicVentureNames = new Map(
  ventureRegistrySource.ventures
    .filter(({ visibility }) => visibility === "public")
    .map(({ id, name }) => [id, id === "caught-up" ? "DNESKAi" : name])
);

/** Translate registry scope into names a reader can see without leaking machine ids. */
export function publicAgentAssignments(agent: Pick<Agent, "ventures">): readonly string[] {
  if (agent.ventures === "global") return ["Every venture"];
  return agent.ventures.flatMap((id) => {
    const name = publicVentureNames.get(id);
    return name ? [name] : [];
  });
}

export function publicAgentAssignment(agent: Pick<Agent, "ventures">): string {
  const names = publicAgentAssignments(agent);
  return names.length ? names.join(" · ") : "No venture assignment recorded";
}
