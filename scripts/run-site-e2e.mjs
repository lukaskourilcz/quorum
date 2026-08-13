import { spawnSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("pnpm did not expose its CLI path to the site e2e runner.");
}

const suppliedArgs = process.argv.slice(2);
const forwardedArgs = suppliedArgs[0] === "--" ? suppliedArgs.slice(1) : suppliedArgs;
for (const project of ["chromium", "chromium-write-journeys"]) {
  const result = spawnSync(
    process.execPath,
    [pnpmCli, "exec", "playwright", "test", `--project=${project}`, ...forwardedArgs],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
