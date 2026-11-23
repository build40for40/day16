import { MONTHS, availability, byId, config } from "./data.js";
import { Recipe } from "./schema.js";

const RANK = { vegan: 0, vegetarian: 1, fish: 2, meat: 3 };

const banned = Object.entries(config.banned).flatMap(([group, terms]) =>
  terms.map((term) => ({ group, term, pattern: new RegExp(`\\b${term}(s|es)?\\b`, "i") })),
);

const isSeasoning = (item) => item.kind === "herb" || item.group === "seasoning" || item.group === "spice";
const lines = (text, perLine) => Math.max(1, Math.ceil(text.trim().length / perLine));

export const ingredientLine = (ingredient) => `${ingredient.quantity} ${ingredient.name}`.trim();

export function fit(recipe) {
  const { limits } = config;
  const methodLines = recipe.steps.reduce((sum, step) => sum + lines(step, limits.method_chars_per_line), 0);
  return {
    ingredientLines: recipe.ingredients.reduce((sum, item) => sum + lines(ingredientLine(item), limits.ingredient_chars_per_line), 0),
    methodLines,
    methodPx: methodLines * limits.method_line_px + Math.max(0, recipe.steps.length - 1) * limits.method_gap_px,
    methodChars: recipe.steps.join("").length,
  };
}

export function recipeText(recipe) {
  return [
    recipe.title,
    recipe.dish_form,
    recipe.time_note,
    ...recipe.utensils,
    ...recipe.steps,
    ...recipe.seasoning.map((item) => item.name),
    ...recipe.ingredients.map(ingredientLine),
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
  if (recipe.ingredients.length > limits.max_ingredients) {
    fail("too_many_ingredients", `${recipe.ingredients.length} ingredients. The page fits ${limits.max_ingredients}, not counting seasoning.`);
  }
  if (size.ingredientLines > limits.ingredient_lines) {
    fail("ingredients_overflow", `The ingredients need ${size.ingredientLines} lines and the column holds ${limits.ingredient_lines}. A line is ${limits.ingredient_chars_per_line} characters, so shorten the long ones or use fewer.`);
  }
  if (recipe.seasoning.length > limits.max_seasoning) fail("too_much_seasoning", `${recipe.seasoning.length} seasonings. The page fits ${limits.max_seasoning}.`);
  if (recipe.steps.length > limits.max_steps) fail("too_many_steps", `${recipe.steps.length} steps. The page fits ${limits.max_steps}.`);
  if (size.methodPx > limits.method_px) {
    const over = Math.ceil((size.methodPx - limits.method_px) / limits.method_line_px);
    fail("method_overflow", `The method is ${size.methodChars} characters over ${recipe.steps.length} steps and runs ${over} line${over > 1 ? "s" : ""} past the bottom of the page. Cut about ${over * limits.method_chars_per_line} characters.`);
  }
  if (recipe.title.split(/\s+/).slice(1).filter((word) => /^[A-Z][a-z]/.test(word)).length > 2) {
    fail("title_case", "Write the title in sentence case: a capital on the first word and on proper nouns only.");
  }
  if (recipe.title.length > limits.max_title_chars) fail("long_title", `The title is over ${limits.max_title_chars} characters.`);
  if (recipe.utensils.join(", ").length > limits.max_utensils_chars) {
    fail("long_utensils", `The utensils must fit one line of ${limits.max_utensils_chars} characters when joined with commas.`);
  }
  if (recipe.time_note.length > limits.max_time_note_chars) fail("long_time_note", `The time note is over ${limits.max_time_note_chars} characters.`);

  return failures;
}
