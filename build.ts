// Puts the site in dist/seasoned: the page, the 365 recipes and their pictures at screen size.
// The Worker only hands out today's recipe and picture, so the rest of the book stays in the book.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import sharp from "sharp";

const root = import.meta.dirname;
const out = join(root, "dist", "seasoned");
const recipeDir = join(root, "recipes", "out", "book", "recipes");
const pictureDir = join(root, "pictures", "seasoned");

rmSync(join(out, "recipes"), { recursive: true, force: true });
mkdirSync(join(out, "recipes"), { recursive: true });
mkdirSync(join(out, "pictures"), { recursive: true });

for (const name of ["index.html", "sample-page.jpg"]) cpSync(join(root, name), join(out, name));

const keys = readdirSync(recipeDir).filter((name) => name.endsWith(".json")).map((name) => basename(name, ".json"));
let resized = 0;
for (const key of keys) {
  const { slot, recipe } = JSON.parse(readFileSync(join(recipeDir, `${key}.json`), "utf8"));
  writeFileSync(join(out, "recipes", `${key}.json`), JSON.stringify({ slot, recipe }));

  const source = join(pictureDir, `${key}.jpg`);
  const target = join(out, "pictures", `${key}.jpg`);
  if (!existsSync(source)) throw new Error(`No picture for ${key} in pictures/seasoned.`);
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) continue;
  await sharp(source).resize({ width: 800 }).jpeg({ quality: 78, mozjpeg: true }).toFile(target);
  resized += 1;
}

console.log(`Built the site in dist/seasoned: ${keys.length} recipes, ${resized} pictures resized.`);
