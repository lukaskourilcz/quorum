#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "site", "src");
const auditRoots = [
  path.join(sourceRoot, "app", "admin"),
  path.join(sourceRoot, "components", "admin"),
];

const productionExtension = /\.(?:css|ts|tsx)$/;
const testFile = /\.(?:spec|test)\./;
const namedHue =
  "(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

const patterns = {
  rawHex: /(?:(?<=\[)|(?<=["']))#[0-9a-fA-F]{3,8}\b/g,
  functionalColour: /rgba?\(/g,
  namedColour: new RegExp(
    `(?:bg|text|border|ring|outline|fill|stroke)-${namedHue}(?:-[0-9]{2,3})?(?:\\/[0-9]+)?`,
    "g",
  ),
  radius:
    /\brounded(?:-[trblxy]{1,2})?(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?/g,
  type: /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])|font-(?:sans|serif|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\]))/g,
  spacing:
    /(?:^|[\s"'`])(?:-)?(?:m[trblxy]?|p[trblxy]?|gap[xy]?|space-[xy])-(?:[0-9.]+|px|auto|\[[^\]]+\])/gm,
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(target);
      if (!entry.isFile() || !productionExtension.test(entry.name) || testFile.test(entry.name)) {
        return [];
      }
      return [target];
    }),
  );
  return nested.flat();
}

function count(pattern, source) {
  return [...source.matchAll(pattern)].length;
}

async function inspect(file) {
  const source = await readFile(file, "utf8");
  return {
    file: path.relative(sourceRoot, file).split(path.sep).join("/"),
    rawColour:
      count(patterns.rawHex, source) +
      count(patterns.functionalColour, source) +
      count(patterns.namedColour, source),
    radius: count(patterns.radius, source),
    type: count(patterns.type, source),
    spacing: count(patterns.spacing, source),
  };
}

const files = (await Promise.all(auditRoots.map(walk))).flat().sort();
const rows = await Promise.all(files.map(inspect));
const totals = rows.reduce(
  (result, row) => ({
    rawColour: result.rawColour + row.rawColour,
    radius: result.radius + row.radius,
    type: result.type + row.type,
    spacing: result.spacing + row.spacing,
  }),
  { rawColour: 0, radius: 0, type: 0, spacing: 0 },
);
const emptyFiles = rows
  .filter((row) => row.rawColour + row.radius + row.type + row.spacing === 0)
  .map((row) => row.file);

const result = {
  roots: auditRoots.map((root) => path.relative(repositoryRoot, root)),
  files: rows.length,
  emptyFiles,
  totals,
  rows,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      `Audited ${result.files} production Admin source files.`,
      `Totals: ${totals.rawColour} raw-colour, ${totals.radius} radius, ${totals.type} typography, ${totals.spacing} spacing occurrences.`,
      `Files with no visual rules: ${emptyFiles.length}.`,
      "",
      "| File | Raw colour | Radius | Typography | Spacing |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...rows.map(
        (row) =>
          `| \`${row.file}\` | ${row.rawColour} | ${row.radius} | ${row.type} | ${row.spacing} |`,
      ),
      "",
    ].join("\n"),
  );
}
