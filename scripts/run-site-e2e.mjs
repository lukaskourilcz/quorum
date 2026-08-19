import { spawnSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("pnpm did not expose its CLI path to the site e2e runner.");
}

const suppliedArgs = process.argv.slice(2);
const forwardedArgs = suppliedArgs[0] === "--" ? suppliedArgs.slice(1) : suppliedArgs;

/*
 * The default read-only audit compiles nearly every route in one development-server process.
 * Next deliberately restarts that process at 80% of its bounded 5 GB heap; in a single 308-test
 * invocation the restart can land between Playwright's readiness check and page.goto, producing
 * ERR_CONNECTION_REFUSED even though the route and its next retry are healthy. Keep the memory
 * safeguard and give each bounded group a fresh server instead. The two operating-surface
 * patterns plus their inverse are a disjoint partition of that spec.
 *
 * Explicit CLI arguments retain the direct one-project behavior so focused local commands keep
 * doing exactly what their caller requested.
 */
const readOnlyRuns = forwardedArgs.length > 0
  ? [forwardedArgs]
  : [
      [
        "tests/e2e/admin-panels.spec.ts",
        "tests/e2e/admin-shell.spec.ts",
        "tests/e2e/buttons.spec.ts"
      ],
      ["tests/e2e/contrast.spec.ts"],
      ["tests/e2e/operating-surfaces.spec.ts", "--grep", "WCAG AA operating surface"],
      ["tests/e2e/operating-surfaces.spec.ts", "--grep", "portfolio surface remains contained"],
      [
        "tests/e2e/operating-surfaces.spec.ts",
        "--grep-invert",
        "WCAG AA operating surface|portfolio surface remains contained"
      ]
    ];

const runs = [
  ...readOnlyRuns.map((args) => ({ args, project: "chromium" })),
  { args: forwardedArgs, project: "chromium-write-journeys" }
];

for (const { args, project } of runs) {
  const result = spawnSync(
    process.execPath,
    [pnpmCli, "exec", "playwright", "test", `--project=${project}`, ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
