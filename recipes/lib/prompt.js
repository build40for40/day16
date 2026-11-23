import { readFileSync } from "node:fs";
import path from "node:path";
import { MONTHS, availability, byId, config, freshIn, pantry, root } from "./data.js";

const KINDS = { veg: "Vegetables", fruit: "Fruit", herb: "Fresh herbs", meat: "Meat", fish: "Fish" };
const KIT = {
  one_pot: "one pot: everything cooks in a single pan or casserole",
  one_tray: "one tray: everything cooks on a single roasting tray",
};

function read(name) {
  return readFileSync(path.join(root, "prompts", name), "utf8");
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`No value for {{${key}}}`);
    return values[key];
  });
}

function pantryList() {
  const groups = Map.groupBy(pantry, (item) => item.group);
  return [...groups]
    .map(([group, items]) => `${group}:\n${items.map((item) => `- ${item.id}: ${item.name}`).join("\n")}`)
    .join("\n\n");
}

export function freshList(month) {
  const groups = Map.groupBy(freshIn(month), (item) => item.kind);
  return Object.entries(KINDS)
    .map(([kind, heading]) => {
      const lines = (groups.get(kind) ?? []).map((item) => {
        const notes = [
          availability(item, month) === "store" && "from store",
          item.origin === "europe" && "from Europe",
          item.garden && "garden",
        ].filter(Boolean);
        return `- ${item.id}: ${item.name}${notes.length ? ` (${notes.join(", ")})` : ""}`;
      });
      return `${heading}:\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function recipeSystem() {
  const { limits } = config;
  return fill(read("recipe.md"), {
    PANTRY: pantryList(),
    HANDS_ON_MAX: limits.hands_on_max,
    QUICK_MAX: limits.quick_max,
    MAX_TITLE_CHARS: limits.max_title_chars,
    MAX_INTRO_WORDS: limits.max_intro_words,
    MAX_INGREDIENTS: limits.max_ingredients,
    MAX_STEPS: limits.max_steps,
    MAX_STEP_WORDS: limits.max_step_words,
  });
}

export function recipeUser(slot, { taken = [], rejected } = {}) {
  const name = (id) => `${byId.get(id).name} (${id})`;
  const lines = [
    `Date: ${slot.label}`,
    `Meal: ${slot.meal}`,
    `Diet: ${slot.diet}${slot.gluten_free ? ", and gluten free" : ""}`,
    `Pace: ${slot.pace === "quick" ? `quick, ${config.limits.quick_max} minutes hands-on or less` : `up to ${config.limits.hands_on_max} minutes hands-on`}`,
    `Hero ingredient: ${name(slot.heroes[0])}`,
    slot.heroes[1] && `Second hero, if it suits: ${name(slot.heroes[1])}`,
    `Suggested kind of dish: ${slot.form}`,
    slot.protein && `Suggested protein: ${name(slot.protein)}`,
    slot.protein_hint && `Protein idea: ${slot.protein_hint}`,
    KIT[slot.kit] && `Kit: ${KIT[slot.kit]}`,
  ].filter(Boolean);

  let message = `${lines.join("\n")}\n\nFresh list for ${MONTHS[slot.month - 1]}:\n\n${freshList(slot.month)}`;
  if (taken.length) {
    message += `\n\nThese pages already exist with the same hero, so make something clearly different:\n${taken.map((title) => `- ${title}`).join("\n")}`;
  }
  if (rejected) {
    message += `\n\nYour last attempt at this page was rejected by the book's checks:\n${rejected.failures.map((failure) => `- ${failure.message}`).join("\n")}\n\nThe rejected page:\n${JSON.stringify(rejected.recipe)}\n\nWrite the whole page again with those problems fixed. Change the dish if that is the cleanest fix.`;
  }
  return message;
}

export function judgeSystem() {
  return fill(read("judge.md"), { PANTRY: pantryList() });
}

export function judgeUser(slot, recipe) {
  return `Date: ${slot.label}\nMeal asked for: ${slot.meal}\nPace asked for: ${slot.pace}\n\nFresh list for ${MONTHS[slot.month - 1]}:\n\n${freshList(slot.month)}\n\nThe page:\n${JSON.stringify(recipe, null, 1)}`;
}
