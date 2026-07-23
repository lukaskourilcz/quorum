export interface ScanFinding {
  rule: string;
  match: string;
}

const FORBIDDEN_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["dynamic-eval", /\beval\s*\(/],
  ["dynamic-function", /\bnew\s+Function\s*\(/],
  ["child-process", /(?:node:)?child_process/],
  ["remote-import", /import\s*\(\s*["']https?:\/\//],
  ["raw-env-access", /\bprocess\.env\b/],
  ["unapproved-network", /\bfetch\s*\(/],
  ["dangerous-html", /dangerouslySetInnerHTML/],
  ["shell-exec", /\bexec(?:File|Sync)?\s*\(/]
];

const SECRET_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];

export function scanGeneratedCode(
  content: string,
  options: { allowNetwork?: boolean; allowEnv?: boolean } = {}
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const [rule, pattern] of FORBIDDEN_PATTERNS) {
    if (rule === "unapproved-network" && options.allowNetwork) {
      continue;
    }
    if (rule === "raw-env-access" && options.allowEnv) {
      continue;
    }
    const match = content.match(pattern);
    if (match) {
      findings.push({ rule, match: match[0] });
    }
  }
  for (const [rule, pattern] of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      findings.push({ rule, match: "[redacted]" });
    }
  }
  return findings;
}

