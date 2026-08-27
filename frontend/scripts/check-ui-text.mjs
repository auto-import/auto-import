import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const write = process.argv.includes("--write");
const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const roots = ["frontend", "backend/src", "contracts"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".d.ts"]);
const excludedDirectories = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
]);
const replacements = [
  ["â€™", "’"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â†’", "→"],
  ["Â·", "·"],
  ["Ã€", "À"],
  ["Ã‚", "Â"],
  ["Ã‡", "Ç"],
  ["Ã‰", "É"],
  ["Ãˆ", "È"],
  ["ÃŠ", "Ê"],
  ["Ã‹", "Ë"],
  ["Ã ", "à"],
  ["Ã¢", "â"],
  ["Ã§", "ç"],
  ["Ã¨", "è"],
  ["Ã©", "é"],
  ["Ãª", "ê"],
  ["Ã«", "ë"],
  ["Ã®", "î"],
  ["Ã¯", "ï"],
  ["Ã´", "ô"],
  ["Ã¹", "ù"],
  ["Ã»", "û"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Â", ""],
];
const corruption = /Ã|Â|â€™|â€“|â€”|â€¦|â†’|ï¿½|�/u;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (excludedDirectories.has(entry.name) || entry.name.startsWith(".next-"))
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (
      extensions.has(extname(entry.name)) &&
      !entry.name.includes(".legacy.") &&
      !entry.name.includes(".spec.") &&
      !entry.name.includes(".test.")
    ) {
      files.push(path);
    }
  }
  return files;
}

const affected = [];
for (const root of roots) {
  for (const path of await collect(join(repositoryRoot, root))) {
    if (path === fileURLToPath(import.meta.url)) continue;
    if (path.endsWith("post-uat-browser-acceptance.mjs")) continue;
    const original = await readFile(path, "utf8");
    if (!corruption.test(original)) continue;
    let repaired = original;
    for (const [damaged, correct] of replacements) {
      repaired = repaired.replaceAll(damaged, correct);
    }
    if (write && repaired !== original) await writeFile(path, repaired, "utf8");
    if (corruption.test(write ? repaired : original)) {
      affected.push(relative(repositoryRoot, path));
    }
  }
}

if (affected.length > 0) {
  throw new Error(`Mojibake markers found:\n${affected.join("\n")}`);
}
console.log(`UI_TEXT_PASS mode=${write ? "repair" : "check"}`);
