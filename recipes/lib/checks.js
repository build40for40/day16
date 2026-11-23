import { MONTHS, availability, byId, config } from "./data.js";
import { Recipe } from "./schema.js";

const RANK = { vegan: 0, vegetarian: 1, fish: 2, meat: 3 };

const banned = Object.entries(config.banned).flatMap(([group, terms]) =>
  terms.map((term) => ({ group, term, pattern: new RegExp(`\\b${term}(s|es)?\\b`, "i") })),
);

const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;

export function recipeText(recipe) {
  return [
    recipe.title,
    recipe.intro,
    recipe.dish_form,
    recipe.tip,
    ...recipe.utensils,
    ...recipe.steps,
    ...recipe.ingredients.flatMap((ingredient) => [ingredient.name, ingredient.prep, ingredient.quantity]),
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

  if (recipe.serves !== config.serves) fail("serves", `Serves ${recipe.serves}, but every page serves ${config.serves}.`);
  if (recipe.meal !== slot.meal) fail("meal", `The page is a ${recipe.meal}, but this date needs a ${slot.meal}.`);
  if (recipe.hands_on_minutes > limits.hands_on_max) {
    fail("hands_on_cap", `Hands-on time is ${recipe.hands_on_minutes} minutes. The cap is ${limits.hands_on_max}.`);
  } else if (slot.pace === "quick" && recipe.hands_on_minutes > limits.quick_max) {
    fail("quick_pace", `This is a quick page, so hands-on time must be ${limits.quick_max} minutes or less, not ${recipe.hands_on_minutes}.`);
  }
  if (recipe.hands_on_minutes < 1 || recipe.total_minutes < recipe.hands_on_minutes) {
    fail("total_time", "Total time must be at least the hands-on time, and both must be positive.");
  }

  const items = [];
  const seen = new Set();
  for (const ingredient of recipe.ingredients) {
    const item = byId.get(ingredient.id);
    if (!item) {
      fail("unknown_ingredient", `"${ingredient.name}" has the id "${ingredient.id}", which is on neither list.`);
      continue;
    }
    if (seen.has(item.id)) fail("duplicate_ingredient", `${item.name} is listed twice.`);
    seen.add(item.id);
    items.push(item);
    if (!availability(item, slot.month)) {
      fail("out_of_season", `${item.name} is not in season or in store in ${MONTHS[slot.month - 1]}.`);
    }
  }

  if (!seen.has(slot.heroes[0])) {
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

  if (recipe.ingredients.length > limits.max_ingredients) {
    fail("too_many_ingredients", `${recipe.ingredients.length} ingredients. The page fits ${limits.max_ingredients}.`);
  }
  if (recipe.steps.length > limits.max_steps) fail("too_many_steps", `${recipe.steps.length} steps. The page fits ${limits.max_steps}.`);
  const longest = Math.max(0, ...recipe.steps.map(words));
  if (longest > limits.max_step_words) fail("long_step", `A step runs to ${longest} words. The limit is ${limits.max_step_words}.`);
  if (recipe.title.split(/\s+/).slice(1).filter((word) => /^[A-Z][a-z]/.test(word)).length > 2) {
    fail("title_case", "Write the title in sentence case: a capital on the first word and on proper nouns only.");
  }
  if (recipe.title.length > limits.max_title_chars) fail("long_title", `The title is over ${limits.max_title_chars} characters.`);
  if (words(recipe.intro) > limits.max_intro_words) fail("long_intro", `The intro is over ${limits.max_intro_words} words.`);

  return failures;
}
