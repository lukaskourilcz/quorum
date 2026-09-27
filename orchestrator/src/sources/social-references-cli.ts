import { stateRoot } from "../paths.js";
import { reserveReferences, runReservedReferences } from "./social-references.js";
const now = new Date();
const token = process.env.APIFY_TOKEN;
if (process.argv.includes("--reserve")) console.log(JSON.stringify(await reserveReferences({ root: stateRoot, now, ...(token ? { token } : {}) })));
else if (process.argv.includes("--run") && token) console.log(JSON.stringify(await runReservedReferences({ root: stateRoot, now, token })));
else throw new Error("Use --reserve then commit its reservation before --run; APIFY_TOKEN is required");
