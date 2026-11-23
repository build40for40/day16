import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { availability, byId, config, dateLabel, fresh, freshIn, root } from "./lib/data.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(config.seed);

function spread(weights, count) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const given = Object.fromEntries(Object.keys(weights).map((key) => [key, 0]));
  return Array.from({ length: count }, (_, i) => {
    const [pick] = Object.keys(weights)
      .filter((key) => weights[key] > 0)
      .map((key) => [key, (weights[key] / total) * (i + 1) - given[key]])
      .sort((a, b) => b[1] - a[1])[0];
    given[pick] += 1;
    return pick;
  });
}

function weighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let at = random() * total;
  for (const option of options) {
    at -= option.weight;
    if (at <= 0) return option.value;
  }
  return options.at(-1).value;
}

function temperature(month) {
  if (month >= 10 || month <= 3) return "cold";
  if (month >= 5 && month <= 8) return "warm";
  return "mild";
}

function rotation() {
  const uses = new Map();
  const last = new Map();
  return (candidates, day, cooldown, score = () => 0) => {
    const rested = candidates.filter((id) => day - (last.get(id) ?? -99) > cooldown);
    const pool = rested.length ? rested : candidates;
    const [pick] = pool
      .map((id) => [id, (uses.get(id) ?? 0) + score(id) + random() * 0.9])
      .sort((a, b) => a[1] - b[1])[0];
    uses.set(pick, (uses.get(pick) ?? 0) + 1);
    last.set(pick, day);
    return pick;
  };
}

const pickHero = rotation();
const pickProtein = rotation();
const pickHint = rotation();

const days = [];
for (let d = new Date(Date.UTC(config.year, 0, 1)); d.getUTCFullYear() === config.year; d.setUTCDate(d.getUTCDate() + 1)) {
  days.push(d.toISOString().slice(0, 10));
}

const meals = spread(config.meals, days.length);
const perMeal = (weights) =>
  Object.fromEntries(
    Object.keys(config.meals).map((meal) => [
      meal,
      spread(typeof weights === "function" ? weights(meal) : weights, config.meals[meal] + 1),
    ]),
  );
const diets = perMeal((meal) => config.diet_mix[meal]);
const glutenFree = perMeal({ yes: config.gluten_free_share, no: 1 - config.gluten_free_share });
const paces = perMeal({ quick: config.quick_share, standard: 1 - config.quick_share });

const seen = Object.fromEntries(Object.keys(config.meals).map((meal) => [meal, 0]));
const recentForms = Object.fromEntries(Object.keys(config.meals).map((meal) => [meal, []]));

function heroCandidates(meal, month, kinds) {
  return freshIn(month)
    .filter((item) => kinds.includes(item.kind) && !config.not_hero.includes(item.id))
    .filter((item) => meal !== "breakfast" || item.kind === "fruit" || config.breakfast_veg.includes(item.id))
    .map((item) => item.id);
}

function heroScore(month) {
  return (id) => {
    const item = byId.get(id);
    return (availability(item, month) === "store" ? 1.5 : 0) - (item.garden ? 0.3 : 0);
  };
}

const slots = days.map((date, index) => {
  const day = index + 1;
  const month = Number(date.slice(5, 7));
  const meal = meals[index];
  const nth = seen[meal]++;
  const diet = diets[meal][nth];
  const temp = temperature(month);

  const fruitFirst = meal === "breakfast" ? random() < 0.65 : meal === "snack" ? random() < 0.5 : false;
  const firstKinds = fruitFirst ? ["fruit"] : ["veg"];
  let pool = heroCandidates(meal, month, firstKinds);
  if (!pool.length) pool = heroCandidates(meal, month, ["veg", "fruit"]);
  const heroes = [pickHero(pool, day, 6, heroScore(month))];
  const heroKind = byId.get(heroes[0]).kind;
  if ((meal === "lunch" || meal === "dinner") && random() < 0.5) {
    const second = heroCandidates(meal, month, random() < 0.15 ? ["fruit"] : ["veg"]).filter((id) => id !== heroes[0]);
    if (second.length) heroes.push(pickHero(second, day, 6, heroScore(month)));
  }

  const form = weighted(
    Object.entries(config.forms[meal])
      .filter(([, opts]) => !opts.hero || opts.hero === heroKind)
      .map(([value, opts]) => ({
        value,
        weight: (opts[temp] ?? 1) * (recentForms[meal].includes(value) ? 0.05 : 1),
      })),
  );
  recentForms[meal] = [form, ...recentForms[meal]].slice(0, 4);

  let protein = null;
  let proteinHint = null;
  if (diet === "meat" || diet === "fish") {
    const light = meal === "breakfast" || meal === "snack";
    const options = fresh
      .filter((item) => item.kind === diet && availability(item, month))
      .filter((item) => !light || config.light_protein[diet].includes(item.id))
      .map((item) => item.id);
    protein = pickProtein(options, day, 5);
  } else if (meal === "lunch" || meal === "dinner") {
    proteinHint = pickHint(config.plant_protein_hints[diet], day, 1);
  }

  return {
    day,
    date,
    label: dateLabel(date),
    month,
    meal,
    form,
    diet,
    gluten_free: glutenFree[meal][nth] === "yes",
    heroes,
    protein,
    protein_hint: proteinHint,
    kit: config.forms[meal][form].kit ?? "any",
    pace: paces[meal][nth],
  };
});

mkdirSync(path.join(root, "out"), { recursive: true });
writeFileSync(path.join(root, "out", "plan.json"), JSON.stringify(slots, null, 1) + "\n");

const tally = (key) =>
  slots.reduce((counts, slot) => {
    for (const value of [slot[key]].flat()) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
console.log(`${slots.length} slots written to recipes/out/plan.json`);
console.log("meals", tally("meal"));
console.log("diets", tally("diet"));
console.log("kit", tally("kit"));
console.log("pace", tally("pace"));
const heroCounts = Object.entries(tally("heroes")).sort((a, b) => b[1] - a[1]);
console.log("heroes used", heroCounts.length, "most", heroCounts.slice(0, 5), "least", heroCounts.slice(-5));
