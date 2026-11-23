import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = JSON.parse(readFileSync(path.join(root, "config.json"), "utf8"));

export const glyphs = JSON.parse(readFileSync(path.join(root, "data", "glyphs.json"), "utf8"));

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function readCsv(file) {
  const [header, ...rows] = readFileSync(path.join(root, "data", file), "utf8").trim().split("\n");
  const keys = header.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((value, i) => [keys[i], value])));
}

function months(spec) {
  if (!spec) return [];
  if (spec === "all") return MONTHS.map((_, i) => i + 1);
  const [from, to] = spec.split("-").map(Number);
  const out = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to) return out;
  }
}

export const fresh = readCsv("seasonal.csv").map((row) => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  season: months(row.season),
  store: months(row.store),
  garden: row.garden === "y",
  origin: row.origin,
  diet: row.kind === "meat" || row.kind === "fish" ? row.kind : "vegan",
  gluten: false,
  fresh: true,
}));

export const pantry = readCsv("pantry.csv").map((row) => ({
  id: row.id,
  name: row.name,
  group: row.group,
  diet: row.diet === "veg" ? "vegetarian" : row.diet,
  gluten: row.gluten === "y",
  fresh: false,
}));

export const byId = new Map([...fresh, ...pantry].map((item) => [item.id, item]));

export function availability(item, month) {
  if (!item.fresh) return "pantry";
  if (item.season.includes(month)) return "season";
  if (item.store.includes(month)) return "store";
  return null;
}

export function freshIn(month) {
  return fresh.filter((item) => availability(item, month));
}

export function dateLabel(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}
