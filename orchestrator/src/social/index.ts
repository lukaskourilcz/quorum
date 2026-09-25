import "../env.js";
import { readSocialPublishClaims, writeSocialPublishClaims } from "./publish-claims.js";
import { redactSocialError, runSocialPublisher, type SocialPublisherPhase } from "./runner.js";

/**
 * `pnpm social:publish -- [--phase claim|send|all] [--claims-file <path>] [--validate-only] [--dry-if-disabled]`
 *
 * The workflow runs `--phase claim`, pushes the claims, then `--phase send` with the same claims
 * file. Without `--phase` the two halves run back to back with no push between, for a local run.
 * Exit 2 means a post was refused or its outcome is ambiguous, so the owner has to look; the
 * workflow records it, commits the run's state and fails the job only after that.
 */
function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(args: readonly string[]): Promise<number> {
  const phase = (option(args, "--phase") ?? "all") as SocialPublisherPhase;
  if (!["claim", "send", "all"].includes(phase)) throw new Error(`Unknown publisher phase ${phase}`);
  const claimsFile = option(args, "--claims-file");
  if (phase !== "all" && !claimsFile) throw new Error(`--phase ${phase} needs --claims-file`);
  const result = await runSocialPublisher({
    validateOnly: args.includes("--validate-only"),
    dryIfDisabled: args.includes("--dry-if-disabled"),
    phase,
    ...(phase === "send" ? { claims: await readSocialPublishClaims(claimsFile!) } : {}),
    ...(process.env.BOARDLESSAI_STATE_ROOT ? { stateRoot: process.env.BOARDLESSAI_STATE_ROOT } : {})
  });
  if (phase === "claim") await writeSocialPublishClaims(claimsFile!, result.claims);
  const { claims, ...printed } = result;
  console.log(JSON.stringify({ ...printed, claimedItems: claims.map(({ itemId }) => itemId) }, null, 2));
  // An ambiguous or refused post paused its connection; either way the owner has to look.
  return result.ambiguous > 0 || result.rejected > 0 ? 2 : 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          error: redactSocialError(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
