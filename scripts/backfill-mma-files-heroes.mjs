import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const articleRoot = path.join(repositoryRoot, "state", "ventures", "mma-files", "articles");
const mediaRoot = path.join(repositoryRoot, "state", "ventures", "mma-files", "media");
const checkOnly = process.argv.includes("--check");

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fileExists(target) {
  try {
    return (await stat(target)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

const restored = [];
const missingPayload = [];
let articleFiles = [];
try {
  articleFiles = await readdir(articleRoot);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const filename of articleFiles.filter((entry) => entry.endsWith(".json")).sort()) {
  const article = JSON.parse(await readFile(path.join(articleRoot, filename), "utf8"));
  const slug = text(article.slug);
  const publishAt = text(article.publishAt);
  const slot = article.slot === "am" || article.slot === "pm" ? article.slot : null;
  const heroPath = text(article.image?.hero_path);
  const payload = text(article.image?.hero_bytes_base64);
  const extension = heroPath ? /\.(webp|png|svg)$/u.exec(heroPath)?.[1] : null;
  if (!slug || !publishAt || !slot || !extension) continue;
  const target = path.join(mediaRoot, `${publishAt.slice(0, 10)}-${slot}-${slug}`, `hero.${extension}`);
  if (await fileExists(target)) continue;
  if (!payload) {
    missingPayload.push(path.relative(repositoryRoot, target));
    continue;
  }
  if (!checkOnly) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(payload, "base64"), { mode: 0o600 });
  }
  restored.push(path.relative(repositoryRoot, target));
}

if (missingPayload.length) {
  console.error(`Missing hero payloads: ${missingPayload.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ mode: checkOnly ? "check" : "backfill", restored, complete: restored.length === 0 || !checkOnly }, null, 2));
  if (checkOnly && restored.length) process.exitCode = 1;
}
