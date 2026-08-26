import { synchronizeImplementationPrograms } from "./service.js";

if (process.argv.includes("--public")) process.env.PROGRAMS_PUBLIC_GITHUB_SYNC = "1";
if (!process.env.GITHUB_TOKEN && process.env.PROGRAMS_PUBLIC_GITHUB_SYNC !== "1") {
  throw new Error("Programs sync requires GITHUB_TOKEN or an explicit --public selection");
}
console.log(JSON.stringify(await synchronizeImplementationPrograms({ force: process.argv.includes("--force") }), null, 2));
