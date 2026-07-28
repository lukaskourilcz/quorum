import "../env.js";
import { runSocialPublisher } from "./runner.js";

const args = process.argv.slice(2);

runSocialPublisher({
  validateOnly: args.includes("--validate-only"),
  dryIfDisabled: args.includes("--dry-if-disabled")
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.ambiguous > 0) {
      process.exitCode = 2;
    }
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
