// Builds the whole book interior: front pages, the 365 recipe pages, then the back pages.
//
//   node book/build.ts            build dist/book/interior.html and print it to PDF
//   node book/build.ts --no-pdf   build the HTML only
//
// Run `npm run pages:book` first. This reads the recipe pages it built (pages/out/book/book.html),
// the words in book/copy.json and the recipe data, and writes into dist/book/ (ignored by git):
//
//   interior.html           the whole book, in colour
//   seasoned-interior.pdf   6 x 9 inch print file, in colour
//   seasoned-interior-bw.pdf  the same, with grey pictures for a black and white print run
//   pictures/, pictures-bw/ the illustrations resized for print (300 pixels per inch)
//
// Resizing uses the macOS `sips` tool and printing uses Google Chrome. Set CHROME_PATH if Chrome
// lives somewhere else. Needs Node 22.18 or newer.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface Slot { day: number; label: string; month: number; meal: string }
interface Ingredient { id: string; name: string }
interface Recipe { title: string; ingredients: Ingredient[] }
interface RecipeFile { slot: Slot; recipe: Recipe }
interface IndexItem { html: string; lines: number }

const root = resolve(import.meta.dirname, "..");
const out = join(root, "dist", "book");
const copy = JSON.parse(readFileSync(join(root, "book", "copy.json"), "utf8"));
const glyphs: Record<string, number> = JSON.parse(readFileSync(join(root, "recipes", "data", "glyphs.json"), "utf8"));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"];

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// How many lines a piece of text takes in a column. Letter widths are measured at 13px, so 12px text is scaled.
function wrap(text: string, widthPx: number, scale = 12 / 13): number {
  const space = glyphs[" "] * scale;
  let count = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const size = [...word].reduce((sum, char) => sum + (glyphs[char] ?? 7) * scale, 0);
    if (used && used + space + size > widthPx) {
      count += 1;
      used = size;
    } else {
      used += (used ? space : 0) + size;
    }
  }
  return count;
}

// ---------- recipe pages, as already built ----------

const built = readFileSync(join(root, "pages", "out", "book", "book.html"), "utf8");
const recipeCss = built.match(/<style>([\s\S]*?)<\/style>/)![1];
const fontLink = built.match(/<link[^>]*>/)![0];
const icons = built.match(/<svg aria-hidden="true" width="0"[\s\S]*?<\/svg>/)![0];
const recipePages = built
  .slice(built.indexOf('<div class="page'), built.lastIndexOf("</body>"))
  .replace(/src="[^"]*\/(\d\d-\d\d)\.jpg"/g, 'src="PICTURES/$1.jpg"')
  .trim();

const recipeDir = join(root, "recipes", "out", "book", "recipes");
const recipes: RecipeFile[] = readdirSync(recipeDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(recipeDir, name), "utf8")) as RecipeFile)
  .sort((a, b) => a.slot.day - b.slot.day);

// ---------- the other pages ----------

const CSS = `
.matter .box{position:absolute;left:95px;top:56px;width:386px;height:760px;display:flex;flex-direction:column}
.matter h2{margin:0 0 20px;font-size:25px;line-height:31px;font-weight:400;letter-spacing:-0.2px}
.matter h3{margin:16px 0 8px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.4px}
.matter p{margin:0 0 12px;font-size:13px;line-height:21px}
.matter .lead{color:#4B5A4E}
.matter .small p,.matter p.small{font-size:12px;line-height:18px;color:#4B5A4E}
.matter .middle{justify-content:center}
.matter .wordmark{font-size:44px;line-height:48px;font-weight:600;letter-spacing:-1.5px}
.matter .subtitle{margin-top:14px;font-size:15px;line-height:22px;font-weight:300;max-width:260px}
.matter .authors{margin-top:auto;font-size:13px;line-height:21px}
.matter dl{margin:0;font-size:13px;line-height:21px}
.matter dt{font-weight:600;margin-top:10px}
.matter dd{margin:0}
.matter .contents{display:grid;grid-template-columns:1fr auto;gap:0 16px;font-size:13px;line-height:26px}
.matter .contents span:nth-child(even){color:#8C968C;text-align:right}
.matter .columns2{display:flex;gap:16px;align-items:flex-start;font-size:12px;line-height:16px}
.matter .columns2 > div{flex:0 0 185px;min-width:0}
.matter .entry{margin-bottom:6px}
.matter .entry b{font-weight:600;display:block}
.matter .entry span{color:#4B5A4E}
.matter .row{display:flex;gap:6px}
.matter .row i{flex:0 0 44px;font-style:normal;color:#8C968C}
.matter .group{font-weight:600;letter-spacing:0.4px;margin:0 0 6px;padding-top:2px}
.matter .ruled{flex:1;margin-top:8px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 27px,#B9B9AE 27px,#B9B9AE 28px)}
`;

const side = (pageNumber: number) => (pageNumber % 2 === 0 ? " verso" : "");
const paragraphs = (list: string[]) => list.map((text) => `<p>${esc(text)}</p>`).join("\n");

// The season line from the cover and the recipe pages, with the whole year still ahead: no dot, nothing filled in.
function seasonLine(): string {
  const tops = [218, 351, 510, 669, 775];
  const names = ["winter", "spring", "summer", "autumn", "winter"];
  return `<div class="year"></div>${names.map((name, index) => `<span class="season on" style="top:${tops[index]}px"><svg viewBox="0 0 24 24"><use href="#${name}"></use></svg></span>`).join("")}`;
}

function frontPages(): string[] {
  const { copyright, how_to_read: how, introduction: intro } = copy;
  const monthRows = MONTHS.map((month, index) => {
    const days = recipes.filter((file) => file.slot.month === index + 1).map((file) => file.slot.day);
    return `<span>${month}</span><span>days ${Math.min(...days)} to ${Math.max(...days)}</span>`;
  }).join("\n");
  return [
    `<div class="box middle"><div class="wordmark">${esc(copy.wordmark)}</div></div>`,
    ``,
    `<div class="box"><div style="margin-top:150px" class="wordmark">${esc(copy.wordmark)}</div><div class="subtitle">${esc(copy.subtitle)}</div><div class="authors">${copy.authors.map(esc).join("<br>")}</div></div>${seasonLine()}`,
    `<div class="box small" style="justify-content:flex-end"><p>${esc(copy.title)}<br>${esc(copy.subtitle)}</p><p>${copy.authors.map(esc).join("<br>")}</p><p>${esc(copyright.line)}</p><p>${esc(copyright.rights)}</p><p>${esc(copyright.isbn)}<br>${esc(copyright.imprint)}</p><h3>${esc(copyright.note_heading)}</h3>${paragraphs(copyright.note)}<p>${esc(copyright.edition)}</p></div>`,
    `<div class="box"><h2>Contents</h2><div class="contents"><span>${esc(how.heading)}</span><span></span><span>${esc(intro.heading)}</span><span></span>\n${monthRows}\n<span>${esc(copy.index_ingredients_heading)}</span><span></span><span>${esc(copy.index_meals_heading)}</span><span></span><span>${esc(copy.acknowledgements.heading)}</span><span></span><span>${esc(copy.about.heading)}</span><span></span></div></div>`,
    `<div class="box"><h2>${esc(how.heading)}</h2><p class="lead">${esc(how.lead)}</p><dl>${how.items.map(([term, text]: string[]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("")}</dl></div>`,
    `<div class="box"><h2>${esc(intro.heading)}</h2>${paragraphs(intro.paragraphs)}</div>`,
    `<div class="box"><h3 style="margin-top:0">${esc(intro.rules_heading)}</h3><dl>${intro.rules.map(([term, text]: string[]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("")}</dl><h3 style="margin-top:28px">${esc(intro.made_heading)}</h3>${paragraphs(intro.made)}</div>`,
  ];
}

// Lays index items out in two columns a page, filling each column before starting the next.
function indexPages(heading: string, lead: string, items: IndexItem[]): string[] {
  const pages: string[] = [];
  let columns: string[][] = [[]];
  let used = 0;
  const room = () => (pages.length === 0 ? 40 : 44);
  const flush = () => {
    const head = pages.length === 0 ? `<h2>${esc(heading)}</h2>${lead ? `<p class="lead" style="margin-top:-8px">${esc(lead)}</p>` : ""}` : "";
    pages.push(`<div class="box">${head}<div class="columns2">${columns.map((column) => `<div>${column.join("")}</div>`).join("")}</div></div>`);
    columns = [[]];
    used = 0;
  };
  for (const item of items) {
    if (used + item.lines > room()) {
      if (columns.length === 2) flush();
      else columns.push([]);
      used = 0;
    }
    columns[columns.length - 1].push(item.html);
    used += item.lines;
  }
  if (columns.some((column) => column.length)) flush();
  return pages;
}

function ingredientIndex(): string[] {
  const fresh = new Map<string, string>();
  for (const line of readFileSync(join(root, "recipes", "data", "seasonal.csv"), "utf8").trim().split("\n").slice(1)) {
    const [id, name] = line.split(",");
    fresh.set(id, name);
  }
  const uses = new Map<string, Map<number, number[]>>();
  for (const { slot, recipe } of recipes) {
    for (const id of new Set(recipe.ingredients.map((ingredient) => ingredient.id))) {
      const name = fresh.get(id);
      if (!name) continue;
      const months = uses.get(name) ?? uses.set(name, new Map()).get(name)!;
      const days = months.get(slot.month) ?? months.set(slot.month, []).get(slot.month)!;
      days.push(Number(slot.label.split(" ")[0]));
    }
  }
  const items = [...uses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, months]) => {
      const dates = [...months.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([month, days]) => `${MONTHS[month - 1].slice(0, 3)} ${days.join(", ")}`)
        .join(" · ");
      return { html: `<div class="entry"><b>${esc(name)}</b><span>${esc(dates)}</span></div>`, lines: 1 + wrap(dates, 178) + 0.4 };
    });
  return indexPages(copy.index_ingredients_heading, copy.index_ingredients_lead, items);
}

function mealIndex(): string[] {
  const items: IndexItem[] = [];
  for (const meal of MEALS) {
    items.push({ html: `<div class="group"${items.length ? ' style="margin-top:12px"' : ""}>${meal}</div>`, lines: items.length ? 2.2 : 1.5 });
    for (const { slot, recipe } of recipes.filter((file) => file.slot.meal === meal)) {
      const [day, month] = slot.label.split(" ");
      items.push({ html: `<div class="row"><i>${esc(day)} ${esc(month.slice(0, 3))}</i><span>${esc(recipe.title)}</span></div>`, lines: wrap(recipe.title, 128) });
    }
  }
  return indexPages(copy.index_meals_heading, "", items);
}

function backPages(): string[] {
  const simple = (section: { heading: string; paragraphs: string[] }) => `<div class="box"><h2>${esc(section.heading)}</h2>${paragraphs(section.paragraphs)}</div>`;
  const notes = Array.from({ length: copy.notes.pages }, (_, index) =>
    index === 0
      ? `<div class="box"><h2>${esc(copy.notes.heading)}</h2><p class="lead" style="margin-top:-8px">${esc(copy.notes.lead)}</p><div class="ruled"></div></div>`
      : `<div class="box"><div class="ruled" style="margin-top:0"></div></div>`,
  );
  return [...ingredientIndex(), ...mealIndex(), simple(copy.acknowledgements), simple(copy.about), simple(copy.more), ...notes];
}

// ---------- put it together ----------

const front = frontPages();
const back = backPages();
// The first recipe has to open on a right-hand page, which means an even number of pages before it.
if (front.length % 2) throw new Error(`The front pages come to ${front.length}. They must be an even number so day 1 lands on a right-hand page.`);
// A printed book has an even number of sides, so a blank page goes at the end if needed.
if ((front.length + recipes.length + back.length) % 2) back.push("");

const matter = (inner: string, pageNumber: number) => `<div class="page matter${side(pageNumber)}">${inner}</div>`;
const total = front.length + recipes.length + back.length;

function interior(pictures: string, extraCss = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.title)}</title>
${fontLink}
<style>${recipeCss}${CSS}${extraCss}</style>
</head>
<body>
${icons}
${front.map((inner, index) => matter(inner, index + 1)).join("\n")}
${recipePages.replaceAll("PICTURES/", `${pictures}/`)}
${back.map((inner, index) => matter(inner, front.length + recipes.length + index + 1)).join("\n")}
</body>
</html>
`;
}

mkdirSync(out, { recursive: true });

// Pictures at print size: the picture box is 3.7 inches wide, so 1120 pixels is 300 per inch.
const grayProfile = "/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc";
for (const [folder, gray] of [["pictures", false], ["pictures-bw", true]] as const) {
  mkdirSync(join(out, folder), { recursive: true });
  for (const { slot } of recipes) {
    const [day, month] = slot.label.split(" ");
    const key = `${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
    const source = join(root, "pictures", "seasoned", `${key}.jpg`);
    const target = join(out, folder, `${key}.jpg`);
    if (!existsSync(source) || existsSync(target)) continue;
    const options = ["-Z", "1120", "-s", "format", "jpeg", "-s", "formatOptions", "75"];
    if (gray && existsSync(grayProfile)) options.push("--matchTo", grayProfile);
    execFileSync("sips", [...options, source, "--out", target], { stdio: "ignore" });
  }
}

writeFileSync(join(out, "interior.html"), interior("pictures"));
// For a black and white print run the pictures are grey and the badge is a plain dark pill.
writeFileSync(join(out, "interior-bw.html"), interior("pictures-bw", ".badge.spring,.badge.summer,.badge.autumn,.badge.winter{background:#1E2A22;color:#ffffff}"));
console.log(`Built ${total} pages: ${front.length} front, ${recipes.length} recipes, ${back.length} back.`);

if (!process.argv.includes("--no-pdf")) {
  const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(chrome)) throw new Error("Google Chrome was not found. Set CHROME_PATH to print the PDF.");
  for (const [html, pdf] of [["interior.html", "seasoned-interior.pdf"], ["interior-bw.html", "seasoned-interior-bw.pdf"]]) {
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=120000", `--print-to-pdf=${join(out, pdf)}`, `file://${join(out, html)}`], { stdio: "ignore" });
    console.log(`Printed dist/book/${pdf}`);
  }
}
