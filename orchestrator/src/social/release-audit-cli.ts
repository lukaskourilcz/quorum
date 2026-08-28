import { auditSocialRelease } from "./release-audit.js";

const audit = await auditSocialRelease();
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
if (audit.status !== "pass") process.exitCode = 1;
