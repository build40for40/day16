// Builds the book as an EPUB, the free download for phones and e-readers: dist/seasoned/seasoned.epub.
//
//   node book/epub.ts
//
// An EPUB reflows, so it doesn't use the A5 page layout. It reads the recipe JSON and book/copy.json
// directly: a title page, the copyright page, the introduction, one chapter a month and the closing pages.
// Needs the `zip` command, which macOS and the CI runners both have.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import sharp from "sharp";

import type { RecipeFile } from "../pages/page.ts";

const root = resolve(import.meta.dirname, "..");
const copy = JSON.parse(readFileSync(join(root, "book", "copy.json"), "utf8"));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// The ISBN belongs to the printed book, so the ebook has an id of its own.
const ID = "urn:uuid:6bcec68e-81b0-4ea9-8a1e-d86d8ffc5060";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (list: string[]) => list.map((text) => `<p>${esc(text)}</p>`).join("\n");
const terms = (list: string[][]) => `<dl>${list.map(([term, text]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("")}</dl>`;

function minutes(total: number): string {
  if (total < 120) return `${total}m`;
  const rest = total % 60;
  return rest ? `${Math.floor(total / 60)}h ${rest}m` : `${Math.floor(total / 60)}h`;
}

const recipeDir = join(root, "recipes", "out", "book", "recipes");
const recipes = readdirSync(recipeDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ key: basename(name, ".json"), ...(JSON.parse(readFileSync(join(recipeDir, name), "utf8")) as RecipeFile) }))
  .sort((a, b) => a.slot.day - b.slot.day);

const CSS = `
body{font-family:sans-serif;line-height:1.5;margin:0 5%}
h1{font-size:1.6em;line-height:1.2;margin:1em 0 .5em}
h2{font-size:1.3em;line-height:1.25;margin:.4em 0 .3em}
h3{font-size:.85em;letter-spacing:.04em;margin:1.2em 0 .3em}
.recipe{page-break-before:always;break-before:page}
.date{font-size:.85em;color:#4B5A4E;margin:1em 0 0}
.note{font-size:.85em;color:#4B5A4E;margin:.2em 0}
img{display:block;width:100%;height:auto;margin:0 0 .6em}
ul{list-style:none;margin:0;padding:0}
ol{margin:0;padding-left:1.4em}
ol li{margin-bottom:.5em}
dt{font-weight:bold;margin-top:.8em}
dd{margin:0}
.title{text-align:center;margin-top:30%}
.title h1{font-size:2.6em;margin:0}
.small{font-size:.85em}
nav ol{list-style:none;padding-left:0}
nav ol ol{padding-left:1.2em;font-size:.9em}
`;

function xhtml(title: string, body: string, nav = false): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${nav ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ""} lang="en-GB" xml:lang="en-GB">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

function recipeSection({ key, slot, recipe }: (typeof recipes)[number], hasPicture: boolean): string {
  const note = recipe.time_note ? `, ${esc(recipe.time_note)}` : "";
  return `<section class="recipe" id="d${key}">
<p class="date">${esc(slot.label)} · day ${slot.day}</p>
<h2>${esc(recipe.title)}</h2>
${hasPicture ? `<img src="pictures/${key}.jpg" alt=""/>` : ""}
<p class="note">${esc(recipe.utensils.join(", "))}</p>
<p class="note"><b>${minutes(recipe.prep_minutes + recipe.cook_minutes)}</b>: ${minutes(recipe.prep_minutes)} prep + ${minutes(recipe.cook_minutes)} cook${note}</p>
<h3>ingredients</h3>
<ul>${recipe.ingredients.map((item) => `<li>${esc(item.quantity)} ${esc(item.name)}</li>`).join("")}</ul>
<h3>seasoning</h3>
<ul>${recipe.seasoning.map((item) => `<li>${esc(item.name)}</li>`).join("")}</ul>
<h3>method</h3>
<ol>${recipe.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
</section>`;
}

const work = mkdtempSync(join(tmpdir(), "seasoned-epub-"));
const content = join(work, "OEBPS");
mkdirSync(join(work, "META-INF"));
mkdirSync(join(content, "pictures"), { recursive: true });

const pictures = new Set<string>();
for (const { key } of recipes) {
  const source = join(root, "pictures", "seasoned", `${key}.jpg`);
  if (!existsSync(source)) continue;
  await sharp(source).resize({ width: 680 }).jpeg({ quality: 62, mozjpeg: true }).toFile(join(content, "pictures", `${key}.jpg`));
  pictures.add(key);
}

const { copyright, introduction: intro } = copy;
const chapters: { file: string; title: string; body: string }[] = [
  { file: "title.xhtml", title: copy.title, body: `<div class="title"><h1>${esc(copy.wordmark)}</h1><p>${esc(copy.subtitle)}</p><p>${copy.authors.map(esc).join("<br/>")}</p></div>` },
  {
    file: "copyright.xhtml",
    title: "Copyright",
    body: `<div class="small"><p>${esc(copy.title)}<br/>${esc(copy.subtitle)}</p><p>${esc(copyright.line)}</p><p>${esc(copyright.rights)}</p><h3>${esc(copyright.note_heading)}</h3>${paragraphs(copyright.note)}<p>${esc(copyright.edition)}</p></div>`,
  },
  {
    file: "introduction.xhtml",
    title: intro.heading,
    body: `<h1>${esc(intro.heading)}</h1>${paragraphs(intro.paragraphs)}<h3>${esc(intro.rules_heading)}</h3>${terms(intro.rules)}<h3>${esc(intro.made_heading)}</h3>${paragraphs(intro.made)}`,
  },
  ...MONTHS.map((month, index) => ({
    file: `month-${String(index + 1).padStart(2, "0")}.xhtml`,
    title: month,
    body: `<h1>${month}</h1>\n${recipes.filter((file) => file.slot.month === index + 1).map((file) => recipeSection(file, pictures.has(file.key))).join("\n")}`,
  })),
  { file: "acknowledgements.xhtml", title: copy.acknowledgements.heading, body: `<h1>${esc(copy.acknowledgements.heading)}</h1>${paragraphs(copy.acknowledgements.paragraphs)}` },
  { file: "about.xhtml", title: copy.about.heading, body: `<h1>${esc(copy.about.heading)}</h1>${paragraphs(copy.about.paragraphs)}` },
];

for (const chapter of chapters) writeFileSync(join(content, chapter.file), xhtml(chapter.title, chapter.body));

const navItems = chapters
  .map((chapter) => {
    const month = chapter.file.match(/^month-(\d\d)/)?.[1];
    const days = month
      ? `<ol>${recipes.filter((file) => file.slot.month === Number(month)).map((file) => `<li><a href="${chapter.file}#d${file.key}">${esc(file.slot.label.split(" ")[0] ?? "")}: ${esc(file.recipe.title)}</a></li>`).join("")}</ol>`
      : "";
    return `<li><a href="${chapter.file}">${esc(chapter.title)}</a>${days}</li>`;
  })
  .join("\n");
writeFileSync(join(content, "nav.xhtml"), xhtml("Contents", `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n${navItems}\n</ol></nav>`, true));
writeFileSync(join(content, "style.css"), CSS);

const manifest = [
  `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
  `<item id="css" href="style.css" media-type="text/css"/>`,
  ...chapters.map((chapter, index) => `<item id="c${index}" href="${chapter.file}" media-type="application/xhtml+xml"/>`),
  ...[...pictures].map((key) => `<item id="p${key}" href="pictures/${key}.jpg" media-type="image/jpeg"/>`),
];
const firstRecipe = chapters.findIndex((chapter) => chapter.file.startsWith("month-"));
const spine = [
  ...chapters.slice(0, firstRecipe).map((_, index) => `<itemref idref="c${index}"/>`),
  `<itemref idref="nav"/>`,
  ...chapters.slice(firstRecipe).map((_, index) => `<itemref idref="c${firstRecipe + index}"/>`),
];
writeFileSync(
  join(content, "content.opf"),
  `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="en-GB">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">${ID}</dc:identifier>
<dc:title>${esc(`${copy.title}: ${copy.subtitle}`)}</dc:title>
<dc:language>en-GB</dc:language>
${copy.authors.map((author: string) => `<dc:creator>${esc(author)}</dc:creator>`).join("\n")}
<dc:publisher>40 for 40 Ltd</dc:publisher>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine>
${spine.join("\n")}
</spine>
</package>
`,
);
writeFileSync(
  join(work, "META-INF", "container.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
);
writeFileSync(join(work, "mimetype"), "application/epub+zip");

const epub = join(root, "dist", "seasoned", "seasoned.epub");
mkdirSync(join(root, "dist", "seasoned"), { recursive: true });
rmSync(epub, { force: true });
// The mimetype has to be the first file in the archive and stored without compression.
execFileSync("zip", ["-X0q", epub, "mimetype"], { cwd: work });
execFileSync("zip", ["-Xr9Dq", epub, "META-INF", "OEBPS"], { cwd: work });
rmSync(work, { recursive: true });

const megabytes = statSync(epub).size / 1e6;
if (megabytes > 25) throw new Error(`The EPUB is ${megabytes.toFixed(1)} MB. Cloudflare serves files up to 25 MB.`);
console.log(`Built dist/seasoned/seasoned.epub: ${recipes.length} recipes, ${megabytes.toFixed(1)} MB`);
