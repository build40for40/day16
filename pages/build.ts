// Turns recipe JSON files into A5 book pages.
//
//   node pages/build.ts                 build the sample recipes into pages/out
//   node pages/build.ts --in <dir>      read recipe JSON from another folder
//   node pages/build.ts --out <dir>     write the pages somewhere else
//   node pages/build.ts --pictures <dir>  folder of pictures named like the recipes (11-06.jpg)
//   node pages/build.ts --first-side left  put day 1 on a left-hand page (the default is right)
//
// It writes one HTML file per recipe and a book.html holding every page in date
// order, ready to print to PDF at A5. Needs Node 22.18 or newer, which runs
// TypeScript files directly.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { CSS, FONT, ICONS, escapeHtml, page, sideOf } from "./page.ts";
import type { RecipeFile, Side } from "./page.ts";

function document(title: string, pages: string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${FONT}
<style>${CSS}</style>
</head>
<body>
${ICONS}
${pages.join("\n")}
</body>
</html>
`;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const inDir = resolve(option("in", "recipes/out/sample/recipes"));
const outDir = resolve(option("out", "pages/out"));
const pictureDir = resolve(option("pictures", "pictures"));
const firstSide: Side = option("first-side", "right") === "left" ? "left" : "right";

mkdirSync(outDir, { recursive: true });

const files = readdirSync(inDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ key: basename(name, ".json"), data: JSON.parse(readFileSync(join(inDir, name), "utf8")) as RecipeFile }))
  .sort((a, b) => a.data.slot.day - b.data.slot.day);

const pages: string[] = [];
for (const { key, data } of files) {
  const picturePath = join(pictureDir, `${key}.jpg`);
  const picture = existsSync(picturePath) ? relative(outDir, picturePath) : null;
  const html = page(data, picture, sideOf(data.slot.day, firstSide));
  pages.push(html);
  writeFileSync(join(outDir, `${key}.html`), document(`Seasoned: ${data.slot.label}`, [html]));
}
writeFileSync(join(outDir, "book.html"), document("Seasoned", pages));

console.log(`Built ${pages.length} pages and book.html in ${relative(process.cwd(), outDir) || "."}`);
