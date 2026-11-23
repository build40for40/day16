// One recipe as an A5 book page. Shared by the page builder and the Worker, so it has no imports.

export interface Slot {
  day: number;
  label: string;
  month: number;
}

export interface Named {
  id: string;
  name: string;
}

export interface Ingredient extends Named {
  quantity: string;
}

export interface Recipe {
  title: string;
  dish_form: string;
  utensils: string[];
  prep_minutes: number;
  cook_minutes: number;
  time_note: string;
  seasoning: Named[];
  ingredients: Ingredient[];
  steps: string[];
}

export interface RecipeFile {
  slot: Slot;
  recipe: Recipe;
}

export type Side = "left" | "right";

// Colours and type follow the Seasoned brand guidelines: a white page so the book prints in black and white, Cavolo nero for text,
// Moss, Sage and Stone for the quieter parts, Figtree throughout, and one pop of colour per page,
// the ingredients badge in the season's main colour.
// The page is A5 (148 x 210 mm), which is 559 x 794 CSS pixels. It follows Lulu's interior
// guidelines for a 151 to 400 page book: 25 mm on the binding side and 13 mm on the other three.
// The outer edge is what you see when you flick through the book: on the right of a
// right-hand page and on the left of a left-hand page. Everything else keeps its place.
export const PAGE = { widthMm: 148, heightMm: 210, widthPx: 559, heightPx: 794 };
export const BOX = { left: 95, top: 50, width: 369, height: 695 };
export const YEAR_LINE_TOP = 172;
export const YEAR_LINE_HEIGHT = 573;
export const SEASONS = ["winter", "spring", "summer", "autumn", "winter"] as const;
export const SEASON_TOPS = [206, 326, 469, 613, 708];

export const FONT = `<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;600;700&display=swap" rel="stylesheet">`;

export const CSS = `
body{margin:0;background:#ffffff}
.page{position:relative;width:${PAGE.widthMm}mm;height:${PAGE.heightMm}mm;overflow:hidden;background:#ffffff;color:#1E2A22;font-family:'Figtree',system-ui,sans-serif;font-weight:300}
.content{position:absolute;left:${BOX.left}px;top:${BOX.top}px;width:${BOX.width}px;display:flex;flex-direction:column}
.picture{width:339px;height:154px;background:#F3ECDF;display:flex;align-items:center;justify-content:center;font-size:12px;color:#4B5A4E;object-fit:cover}
/* The title always takes two lines of space and sits at the bottom of it, so the ingredients start at the same height on every page. */
h1{margin:16px 0 0;min-height:60px;display:flex;align-items:flex-end;font-size:24px;line-height:30px;font-weight:400;letter-spacing:-0.2px}
.note{font-size:12px;line-height:16px;color:#4B5A4E}
.note b{font-weight:600;color:#1E2A22}
.columns{margin-top:14px;display:flex;gap:18px;align-items:flex-start;font-size:12.5px}
.left{flex:0 0 146px;line-height:19px}
.method{flex:1 1 0;min-width:0;line-height:19px}
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
.date{position:absolute;right:48px;top:${BOX.top}px;text-align:right;white-space:nowrap}
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
@page{size:${PAGE.widthMm}mm ${PAGE.heightMm}mm;margin:0}
@media print{.page{break-after:page}}
`;

export const ICONS = `<svg aria-hidden="true" width="0" height="0" style="position:absolute">
<symbol id="winter" viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"></path></symbol>
<symbol id="spring" viewBox="0 0 24 24"><path d="M12 21v-9M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5z"></path></symbol>
<symbol id="summer" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path></symbol>
<symbol id="autumn" viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l8-8"></path></symbol>
</svg>`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function minutes(total: number): string {
  if (total < 120) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

// Winter sits at both ends of the year line: January and February at the top, December at the bottom.
export function seasonIndex(month: number): number {
  if (month === 12) return 4;
  if (month <= 2) return 0;
  if (month <= 5) return 1;
  if (month <= 8) return 2;
  return 3;
}

// Day 1 sits on a right-hand page unless told otherwise, and the sides alternate from there.
export function sideOf(day: number, firstSide: Side): Side {
  const sameAsFirst = day % 2 === 1;
  if (firstSide === "right") return sameAsFirst ? "right" : "left";
  return sameAsFirst ? "left" : "right";
}

export function page(file: RecipeFile, picture: string | null, side: Side): string {
  const { slot, recipe } = file;
  const [dayOfMonth = "", month = ""] = slot.label.split(" ");
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
<div class="note" style="margin-top:12px">${escapeHtml(recipe.utensils.join(", "))}</div>
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
