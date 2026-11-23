// Turns recipe JSON files into 6 x 9 inch book pages.
//
//   node pages/build.ts                 build the sample recipes into pages/out
//   node pages/build.ts --in <dir>      read recipe JSON from another folder
//   node pages/build.ts --out <dir>     write the pages somewhere else
//   node pages/build.ts --pictures <dir>  folder of pictures named like the recipes (11-06.jpg)
//   node pages/build.ts --first-side left  put day 1 on a left-hand page (the default is right)
//
// It writes one HTML file per recipe and a book.html holding every page in date
// order, ready to print to PDF at 6 x 9 inches. Needs Node 22.18 or newer, which runs
// TypeScript files directly.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

interface Slot {
  day: number;
  label: string;
  month: number;
}

interface Named {
  id: string;
  name: string;
}

interface Ingredient extends Named {
  quantity: string;
}

interface Recipe {
  title: string;
  utensils: string[];
  prep_minutes: number;
  cook_minutes: number;
  time_note: string;
  seasoning: Named[];
  ingredients: Ingredient[];
  steps: string[];
}

interface RecipeFile {
  slot: Slot;
  recipe: Recipe;
}

// Colours and type follow the Seasoned brand guidelines: a white page so the book prints in black and white, Cavolo nero for text,
// Moss, Sage and Stone for the quieter parts, Figtree throughout, and one pop of colour per page,
// the ingredients badge in the season's main colour.
// The page is 6 x 9 inches (152 x 229 mm), which is 576 x 864 CSS pixels. It follows Lulu's interior
// guidelines for a 151 to 400 page book: 25 mm on the binding side and 13 mm on the other three.
// The outer edge is what you see when you flick through the book: on the right of a
// right-hand page and on the left of a left-hand page. Everything else keeps its place.
const YEAR_LINE_TOP = 180;
const YEAR_LINE_HEIGHT = 636;
const SEASONS = ["winter", "spring", "summer", "autumn", "winter"] as const;
const SEASON_TOPS = [218, 351, 510, 669, 775];

const FONT = `<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;600;700&display=swap" rel="stylesheet">`;

const CSS = `
body{margin:0;background:#ffffff}
.page{position:relative;width:576px;height:864px;overflow:hidden;background:#ffffff;color:#1E2A22;font-family:'Figtree',system-ui,sans-serif;font-weight:300}
.content{position:absolute;left:95px;top:56px;width:386px;display:flex;flex-direction:column}
.picture{width:356px;height:196px;background:#F3ECDF;display:flex;align-items:center;justify-content:center;font-size:12px;color:#4B5A4E;object-fit:cover}
/* The title always takes two lines of space and sits at the bottom of it, so the ingredients start at the same height on every page. */
h1{margin:26px 0 0;min-height:62px;display:flex;align-items:flex-end;font-size:25px;line-height:31px;font-weight:400;letter-spacing:-0.2px}
.note{font-size:12px;line-height:16px;color:#4B5A4E}
.note b{font-weight:600;color:#1E2A22}
.columns{margin-top:18px;display:flex;gap:20px;align-items:flex-start;font-size:13px}
.left{flex:0 0 150px;line-height:20px}
.method{flex:1 1 0;min-width:0;line-height:20px}
.heading{font-size:12px;line-height:24px;font-weight:600;letter-spacing:0.4px;margin-bottom:8px}
.badge{display:inline-block;font-size:13px;line-height:16px;font-weight:700;padding:4px 11px;border-radius:12px;margin-bottom:8px}
.badge.spring{background:#E8708A;color:#1E2A22}
.badge.summer{background:#E0482F;color:#FBF7EF}
.badge.autumn{background:#D9822B;color:#1E2A22}
.badge.winter{background:#7A1F3D;color:#FBF7EF}
.left .seasoning{margin-top:10px}
ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
li{display:flex;gap:12px}
li span:first-child{flex:0 0 8px;color:#8C968C}
.date{position:absolute;right:48px;top:48px;text-align:right;white-space:nowrap}
.date .number{font-size:40px;line-height:42px;font-weight:300;letter-spacing:-1px}
.date .month{font-size:13px;line-height:18px;font-weight:400}
.date .day{margin-top:6px;font-size:12px;line-height:16px;color:#8C968C}
.season{position:absolute;right:59px;height:30px;display:flex;align-items:center;color:#8C968C}
.season svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.season.on{color:#1E2A22}
.season.on svg{stroke-width:1.8}
.year{position:absolute;right:51px;top:${YEAR_LINE_TOP}px;width:1px;height:${YEAR_LINE_HEIGHT}px;background:#B9B9AE}
.gone{position:absolute;right:50px;top:${YEAR_LINE_TOP}px;width:2px;background:#1E2A22}
.today{position:absolute;right:48px;width:7px;height:7px;border-radius:50%;background:#1E2A22}
.verso .picture{margin-left:30px}
.verso .date{right:auto;left:48px;text-align:left}
.verso .season{right:auto;left:59px}
.verso .year{right:auto;left:51px}
.verso .gone{right:auto;left:50px}
.verso .today{right:auto;left:48px}
@page{size:6in 9in;margin:0}
@media print{.page{break-after:page}}
`;

const ICONS = `<svg aria-hidden="true" width="0" height="0" style="position:absolute">
<symbol id="winter" viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"></path></symbol>
<symbol id="spring" viewBox="0 0 24 24"><path d="M12 21v-9M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5z"></path></symbol>
<symbol id="summer" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path></symbol>
<symbol id="autumn" viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l8-8"></path></symbol>
</svg>`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function minutes(total: number): string {
  if (total < 120) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

// Winter sits at both ends of the year line: January and February at the top, December at the bottom.
function seasonIndex(month: number): number {
  if (month === 12) return 4;
  if (month <= 2) return 0;
  if (month <= 5) return 1;
  if (month <= 8) return 2;
  return 3;
}

type Side = "left" | "right";

// Day 1 sits on a right-hand page unless --first-side says otherwise, and the sides alternate from there.
function sideOf(day: number, firstSide: Side): Side {
  const sameAsFirst = day % 2 === 1;
  if (firstSide === "right") return sameAsFirst ? "right" : "left";
  return sameAsFirst ? "left" : "right";
}

function page(file: RecipeFile, picture: string | null, side: Side): string {
  const { slot, recipe } = file;
  const [dayOfMonth, month] = slot.label.split(" ");
  const total = recipe.prep_minutes + recipe.cook_minutes;
  const gone = Math.round(((slot.day - 0.5) / 365) * YEAR_LINE_HEIGHT * 10) / 10;
  const season = seasonIndex(slot.month);
  const note = recipe.time_note ? `, ${escapeHtml(recipe.time_note)}` : "";
  const image = picture
    ? `<img class="picture" src="${escapeHtml(picture)}" alt="">`
    : `<div class="picture" role="img" aria-label="Picture to come">picture</div>`;

  return `<div class="page${side === "left" ? " verso" : ""}">
<div class="content">
${image}
<h1>${escapeHtml(recipe.title)}</h1>
<div class="note" style="margin-top:14px">${escapeHtml(recipe.utensils.join(", "))}</div>
<div class="note" style="margin-top:4px"><b>${minutes(total)}</b>: ${minutes(recipe.prep_minutes)} prep + ${minutes(recipe.cook_minutes)} cook${note}</div>
<div class="columns">
<div class="left">
<div class="badge ${SEASONS[season]}">ingredients</div>
<div>${recipe.ingredients.map((item) => `${escapeHtml(item.quantity)} ${escapeHtml(item.name)}`).join("<br>")}</div>
<div class="heading seasoning">seasoning</div>
<div>${recipe.seasoning.map((item) => escapeHtml(item.name)).join("<br>")}</div>
</div>
<div class="method">
<div class="heading">method</div>
<ol>
${recipe.steps.map((step, index) => `<li><span>${index + 1}</span><span>${escapeHtml(step)}</span></li>`).join("\n")}
</ol>
</div>
</div>
</div>
<div class="date"><div class="number">${escapeHtml(dayOfMonth)}</div><div class="month">${escapeHtml(month.toLowerCase())}</div><div class="day">day ${slot.day}</div></div>
<div role="img" aria-label="Season: ${SEASONS[season]}">
${SEASONS.map((name, index) => `<span class="season${index === season ? " on" : ""}" style="top:${SEASON_TOPS[index]}px"><svg viewBox="0 0 24 24"><use href="#${name}"></use></svg></span>`).join("")}
</div>
<div class="year"></div><div class="gone" style="height:${gone}px"></div>
<div class="today" style="top:${YEAR_LINE_TOP + gone - 3.5}px"></div>
</div>`;
}

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
