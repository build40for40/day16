import { writeFileSync } from "node:fs";
import path from "node:path";
import { hardChecks } from "./lib/checks.js";
import { byId, config, fresh, root } from "./lib/data.js";
import { CRITERIA } from "./lib/schema.js";
import { args, load } from "./lib/store.js";

const STOP = new Set(["with", "and", "the", "a", "of", "on", "in", "or", "for"]);
const STAPLES = new Set(["salt", "black-pepper", "water", "olive-oil", "rapeseed-oil", "sunflower-oil", "butter"]);

const { set } = args();
const pages = load(set, "recipes").map((page) => ({ ...page, failures: hardChecks(page.recipe, page.slot) }));
if (!pages.length) throw new Error(`No pages in the "${set}" set yet.`);
const judged = new Map(load(set, "judge").map((entry) => [entry.day, entry.judgement]));

const count = (values) =>
  [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
const share = (n) => `${Math.round((n / pages.length) * 100)}%`;
const table = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
const target = (n, min) => `${share(n)} ${n / pages.length >= min ? "✓" : "✗"} (target ${Math.round(min * 100)}%)`;

const failing = pages.filter((page) => page.failures.length);
const veggie = pages.filter((page) => ["vegan", "vegetarian"].includes(page.recipe.diet)).length;
const vegan = pages.filter((page) => page.recipe.diet === "vegan").length;
const glutenFree = pages.filter((page) => page.recipe.gluten_free).length;
const quick = pages.filter((page) => page.recipe.hands_on_minutes <= config.limits.quick_max).length;
const handsOn = pages.map((page) => page.recipe.hands_on_minutes).sort((a, b) => a - b);

const used = pages.flatMap((page) => page.recipe.ingredients.map((ingredient) => byId.get(ingredient.id)).filter(Boolean));
const usedFresh = used.filter((item) => item.fresh && ["veg", "fruit", "herb"].includes(item.kind));
const unused = fresh.filter((item) => !used.includes(item)).map((item) => item.name);

const closeHeroes = [];
const lastSeen = new Map();
for (const page of pages) {
  const hero = page.slot.heroes[0];
  if (page.slot.day - (lastSeen.get(hero) ?? -99) <= 6) closeHeroes.push(`${byId.get(hero).name}: ${page.slot.label}`);
  lastSeen.set(hero, page.slot.day);
}

const tokens = (title) => new Set(title.toLowerCase().match(/[a-z']+/g)?.filter((word) => !STOP.has(word)) ?? []);
const titles = pages.map((page) => ({ label: page.slot.label, title: page.recipe.title, tokens: tokens(page.recipe.title) }));
const twins = [];
for (let i = 0; i < titles.length; i++) {
  for (let j = i + 1; j < titles.length; j++) {
    const overlap = [...titles[i].tokens].filter((word) => titles[j].tokens.has(word)).length;
    const union = new Set([...titles[i].tokens, ...titles[j].tokens]).size;
    if (union && overlap / union >= 0.6) twins.push(`${titles[i].title} (${titles[i].label}) and ${titles[j].title} (${titles[j].label})`);
  }
}

const judgeRows = CRITERIA.map((name) => {
  const verdicts = pages.map((page) => judged.get(page.slot.day)?.[name]).filter(Boolean);
  const passed = verdicts.filter((verdict) => verdict.pass).length;
  return [name, verdicts.length ? `${passed}/${verdicts.length}` : "not judged"];
});
const judgeFails = pages.flatMap((page) =>
  CRITERIA.filter((name) => judged.get(page.slot.day)?.[name]?.pass === false).map(
    (name) => `- ${page.slot.label}, ${page.recipe.title}: **${name}**. ${judged.get(page.slot.day)[name].reason}`,
  ),
);

const list = (items, empty = "None.") => (items.length ? items.map((item) => `- ${item}`).join("\n") : empty);

const report = `# Seasoned recipe checks: ${set}

${pages.length} pages.

## Hard checks

${pages.length - failing.length} of ${pages.length} pass every hard check. First-attempt passes: ${pages.filter((page) => page.attempts === 1 && !page.failures.length).length}.

${failing.length ? table(["Check", "Pages failing"], count(failing.flatMap((page) => [...new Set(page.failures.map((failure) => failure.code))]))) : ""}

${list(failing.map((page) => `${page.slot.label}, ${page.recipe.title}: ${page.failures.map((failure) => failure.message).join(" ")}`), "")}

## Judge

${table(["Criterion", "Passed"], judgeRows)}

${judgeFails.join("\n")}

## The spread

${table(
  ["Measure", "Result"],
  [
    ["Meals", count(pages.map((page) => page.recipe.meal)).map(([meal, n]) => `${meal} ${n}`).join(", ")],
    ["Vegetarian or vegan", target(veggie, config.targets.vegetarian_min)],
    ["Vegan", target(vegan, config.targets.vegan_min)],
    ["Gluten free", target(glutenFree, config.targets.gluten_free_min)],
    [`Hands-on ${config.limits.quick_max} minutes or less`, target(quick, config.targets.quick_min)],
    ["Hands-on minutes", `median ${handsOn[Math.floor(handsOn.length / 2)]}, longest ${handsOn.at(-1)}`],
    ["Kit", count(pages.map((page) => page.recipe.kit)).map(([kit, n]) => `${kit.replaceAll("_", " ")} ${n}`).join(", ")],
    ["Hero you can grow", share(pages.filter((page) => byId.get(page.slot.heroes[0]).garden).length)],
    ["Fresh produce from the UK", `${Math.round((usedFresh.filter((item) => item.origin === "uk").length / Math.max(1, usedFresh.length)) * 100)}% of uses`],
    ["Kept the suggested kind of dish", share(pages.filter((page) => page.recipe.dish_form.toLowerCase().includes(page.slot.form.split(" ")[0])).length)],
  ],
)}

### Kinds of dish

${count(pages.map((page) => page.recipe.dish_form.toLowerCase())).map(([form, n]) => `${form} ${n}`).join(", ")}

### Most used ingredients

${count(used.filter((item) => !STAPLES.has(item.id)).map((item) => item.name)).slice(0, 15).map(([name, n]) => `${name} ${n}`).join(", ")}

### Fresh ingredients never used

${unused.join(", ") || "None."}

### Same hero within a week

${list(closeHeroes)}

### Titles that look alike

${list(twins)}
`;

writeFileSync(path.join(root, "out", set, "report.md"), report);
console.log(report);
if (failing.length) process.exitCode = 1;
