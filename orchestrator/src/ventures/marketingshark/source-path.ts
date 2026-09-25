import path from "node:path";

/**
 * Where an import script's `--source` points, read as the person typed it.
 *
 * The import scripts run through `pnpm --filter @boardlessai/orchestrator exec`, whose working
 * directory is `<repo>/orchestrator`, so `path.resolve("../react-express-app")` named
 * `<repo>/react-express-app` rather than the sibling clone the documented command means. pnpm sets
 * `INIT_CWD` to the directory the command was typed in, and a relative path is resolved from there.
 */
export function resolveSourcePath(source: string, environment: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return path.resolve(environment.INIT_CWD?.trim() || cwd, source);
}
