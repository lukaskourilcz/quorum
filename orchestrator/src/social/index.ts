import "../env.js";
import { redactSocialError, runSocialPublisher } from "./runner.js";

const args = process.argv.slice(2);

runSocialPublisher({
  validateOnly: args.includes("--validate-only"),
  dryIfDisabled: args.includes("--dry-if-disabled"),
  ...(process.env.BOARDLESSAI_STATE_ROOT ? { stateRoot: process.env.BOARDLESSAI_STATE_ROOT } : {})
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    // An ambiguous or refused post paused its connection; either way the owner has to look.
    if (result.ambiguous > 0 || result.rejected > 0) {
      process.exitCode = 2;
    }
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
