import { MONTHS, availability, byId, config, glyphs } from "./data.js";
import { Recipe } from "./schema.js";

const RANK = { vegan: 0, vegetarian: 1, fish: 2, meat: 3 };

const banned = Object.entries(config.banned).flatMap(([group, terms]) =>
  terms.map((term) => ({ group, term, pattern: new RegExp(`\\b${term}(s|es)?\\b`, "i") })),
);

const isSeasoning = (item) => item.kind === "herb" || item.group === "seasoning" || item.group === "spice";
const width = (text, scale) => [...text].reduce((sum, char) => sum + (glyphs[char] ?? 7) * scale, 0);

export function wrap(text, widthPx, scale = 1) {
  const space = glyphs[" "] * scale;
  let count = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const size = width(word, scale);
    if (used && used + space + size > widthPx) {
      count += 1;
      used = size;
    } else {
      used += (used ? space : 0) + size;
    }
  }
  return count;
}

export const printedLine = (line) => `${line.quantity ?? ""} ${line.name}`.trim();

export function fit(recipe) {
  const { page } = config;
  const listLines = (list) => list.reduce((sum, line) => sum + wrap(printedLine(line), page.list_px, page.text_scale), 0);
  const titleLines = wrap(recipe.title, page.head_px, page.title_scale);
  const utensilLines = wrap(recipe.utensils.join(", "), page.head_px, page.note_scale);
  const listPx = page.heading_px * 2 + page.seasoning_margin_px + (listLines(recipe.ingredients) + listLines(recipe.seasoning)) * page.line_px;
  const methodLines = recipe.steps.reduce((sum, step) => sum + wrap(step, page.method_px, page.text_scale), 0);
  const methodPx = page.heading_px + methodLines * page.line_px + Math.max(0, recipe.steps.length - 1) * page.step_gap_px;
  const headPx =
    page.picture_px + page.title_margin_px + titleLines * page.title_line_px +
    page.utensils_margin_px + utensilLines * page.note_line_px + page.time_px + page.columns_margin_px;
  return {
    titleLines,
    utensilLines,
    listPx,
    methodPx,
    room: page.content_px - headPx,
    methodWords: recipe.steps.join(" ").split(/\s+/).length,
  };
}

export function recipeText(recipe) {
  return [
    recipe.title,
    recipe.dish_form,
    recipe.time_note,
    ...recipe.utensils,
    ...recipe.steps,
    ...[...recipe.ingredients, ...recipe.seasoning].map(printedLine),
  ].join("\n");
}

export function hardChecks(candidate, slot) {
  const parsed = Recipe.safeParse(candidate);
  if (!parsed.success) {
    return [{ code: "schema", message: `The page doesn't match the schema: ${parsed.error.issues[0].message}` }];
  }
  const recipe = parsed.data;
  const { limits } = config;
  const failures = [];
  const fail = (code, message) => failures.push({ code, message });

  if (recipe.meal !== slot.meal) fail("meal", `The page is a ${recipe.meal}, but this date needs a ${slot.meal}.`);
  if (recipe.prep_minutes > limits.hands_on_max) {
    fail("hands_on_cap", `Prep is ${recipe.prep_minutes} minutes of hands-on work. The cap is ${limits.hands_on_max}.`);
  } else if (slot.pace === "quick" && recipe.prep_minutes > limits.quick_max) {
    fail("quick_pace", `This is a quick page, so prep must be ${limits.quick_max} minutes or less, not ${recipe.prep_minutes}.`);
  }
  if (recipe.prep_minutes < 1 || recipe.cook_minutes < 0) fail("times", "Prep must be at least 1 minute and cook time cannot be negative.");

  const items = [];
  const seen = new Set();
  const resolve = (entry, list) => {
    const item = byId.get(entry.id);
    if (!item) return fail("unknown_ingredient", `"${entry.name}" has the id "${entry.id}", which is on neither list.`);
    if (seen.has(item.id)) fail("duplicate_ingredient", `${item.name} is listed twice.`);
    seen.add(item.id);
    items.push(item);
    if (!availability(item, slot.month)) fail("out_of_season", `${item.name} is not in season or in store in ${MONTHS[slot.month - 1]}.`);
    if (list === "ingredients" && isSeasoning(item)) {
      fail("seasoning_list", `${item.name} belongs in the seasoning list, with any amount given in the method.`);
    }
    if (list === "seasoning" && !isSeasoning(item) && item.id !== "lemons") {
      fail("seasoning_list", `${item.name} is not a seasoning. Put it in the ingredients with a quantity.`);
    }
  };
  recipe.ingredients.forEach((entry) => resolve(entry, "ingredients"));
  recipe.seasoning.forEach((entry) => resolve(entry, "seasoning"));

  if (!recipe.ingredients.some((entry) => entry.id === slot.heroes[0])) {
    fail("missing_hero", `The hero ingredient ${byId.get(slot.heroes[0]).name} (${slot.heroes[0]}) is not in the ingredients.`);
  }

  const actual = Math.max(0, ...items.map((item) => RANK[item.diet]));
  const culprit = (rank) => items.filter((item) => RANK[item.diet] > rank).map((item) => item.name).join(", ");
  if (RANK[recipe.diet] <= RANK.vegetarian && RANK[recipe.diet] < actual) {
    fail("diet_label", `Labelled ${recipe.diet}, but it contains ${culprit(RANK[recipe.diet])}.`);
  }
  if (RANK[slot.diet] <= RANK.vegetarian && actual > RANK[slot.diet]) {
    fail("diet_slot", `This date needs a ${slot.diet} page, but it contains ${culprit(RANK[slot.diet])}.`);
  }
  if (slot.diet === "meat" && !items.some((item) => item.kind === "meat")) {
    fail("diet_slot", "This date needs a meat page, but there is no meat in it.");
  }
  if (slot.diet === "fish" && !items.some((item) => item.kind === "fish" || (item.group === "tin" && item.diet === "fish"))) {
    fail("diet_slot", "This date needs a fish page, but there is no fish in it.");
  }

  const gluten = items.filter((item) => item.gluten).map((item) => item.name).join(", ");
  if (recipe.gluten_free && gluten) fail("gluten_label", `Labelled gluten free, but it contains ${gluten}.`);
  if (slot.gluten_free && gluten) fail("gluten_slot", `This date needs a gluten free page, but it contains ${gluten}.`);
  if (slot.gluten_free && !recipe.gluten_free && !gluten) fail("gluten_label", "Nothing in it contains gluten, so label it gluten free.");

  if (slot.kit !== "any" && recipe.kit !== slot.kit) {
    fail("kit_slot", `This date needs a ${slot.kit.replace("_", " ")} recipe, but the page says ${recipe.kit.replace("_", " ")}.`);
  }

  const text = recipeText(recipe);
  for (const { group, term, pattern } of banned) {
    if (pattern.test(text)) fail(`banned_${group}`, `The page mentions "${term}", which the book doesn't use.`);
  }
  if (/—|\s–\s/.test(text)) fail("dashes", "The text uses a dash to join clauses. Use a full stop or a comma.");

  const size = fit(recipe);
  const overBy = (px) => Math.ceil((px - size.room) / config.page.line_px);
  if (recipe.ingredients.length > limits.max_ingredients) {
    fail("too_many_ingredients", `${recipe.ingredients.length} ingredients. The page fits ${limits.max_ingredients}, not counting seasoning.`);
  }
  if (recipe.seasoning.length > limits.max_seasoning) fail("too_much_seasoning", `${recipe.seasoning.length} seasonings. The page fits ${limits.max_seasoning}.`);
  if (recipe.steps.length > limits.max_steps) fail("too_many_steps", `${recipe.steps.length} steps. The page fits ${limits.max_steps}.`);
  if (size.methodPx > size.room) {
    fail("method_overflow", `The method is ${size.methodWords} words and runs ${overBy(size.methodPx)} lines past the bottom of the page. Cut about ${overBy(size.methodPx) * 6} words.`);
  }
  if (size.listPx > size.room) {
    fail("column_overflow", `The ingredients and seasoning run ${overBy(size.listPx)} lines past the bottom of the page. The column is about 22 characters wide, so shorten the lines that wrap or use fewer.`);
  }
  if (size.titleLines > limits.max_title_lines) fail("long_title", `The title takes ${size.titleLines} lines and the page fits ${limits.max_title_lines}.`);
  if (size.utensilLines > limits.max_utensils_lines) fail("long_utensils", `The utensils take ${size.utensilLines} lines and the page fits ${limits.max_utensils_lines}.`);
  if (recipe.title.split(/\s+/).slice(1).filter((word) => /^[A-Z][a-z]/.test(word)).length > 2) {
    fail("title_case", "Write the title in sentence case: a capital on the first word and on proper nouns only.");
  }
  if (recipe.time_note.length > 30) fail("long_time_note", "The time note is over 30 characters.");

  return failures;
}
