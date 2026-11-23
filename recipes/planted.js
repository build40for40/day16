import { hardChecks } from "./lib/checks.js";
import { pool } from "./lib/llm.js";
import { CRITERIA } from "./lib/schema.js";
import { judge } from "./judge.js";

const slot = {
  day: 14, date: "2027-01-14", label: "14 January", month: 1, meal: "dinner", form: "stew or casserole",
  diet: "vegetarian", gluten_free: false, heroes: ["leeks"], protein: null, protein_hint: "tinned beans or chickpeas",
  kit: "one_pot", pace: "standard",
};

const base = {
  title: "Leek, potato and butter bean stew",
  meal: "dinner",
  dish_form: "stew",
  diet: "vegetarian",
  gluten_free: true,
  kit: "one_pot",
  utensils: ["one large lidded pan"],
  prep_minutes: 15,
  cook_minutes: 30,
  time_note: "",
  best_time: "evening",
  freezes: true,
  seasoning: [
    { id: "salt", name: "salt" },
    { id: "black-pepper", name: "pepper" },
    { id: "thyme", name: "thyme" },
  ],
  ingredients: [
    { id: "olive-oil", quantity: "2 tbsp", name: "olive oil" },
    { id: "leeks", quantity: "4", name: "leeks" },
    { id: "onions", quantity: "1", name: "onion" },
    { id: "garlic", quantity: "2 cloves", name: "garlic" },
    { id: "potatoes", quantity: "600g", name: "potatoes" },
    { id: "vegetable-stock", quantity: "800ml", name: "veg stock" },
    { id: "butter-beans", quantity: "2 tins", name: "butter beans" },
    { id: "wholegrain-mustard", quantity: "1 tbsp", name: "grain mustard" },
    { id: "creme-fraiche", quantity: "4 tbsp", name: "crème fraîche" },
  ],
  steps: [
    "Warm the oil in a large pan. Soften the sliced leeks and chopped onion with a pinch of salt for 10 minutes.",
    "Add the crushed garlic, potatoes in chunks, thyme and stock. Cover and simmer for 20 minutes, until tender.",
    "Stir in the drained beans and mustard. Simmer without the lid for 5 minutes.",
    "Off the heat, stir in the crème fraîche. Season well.",
  ],
};

const add = (...ingredients) => (recipe) => recipe.ingredients.push(...ingredients);
const ingredient = (recipe, id) => recipe.ingredients.find((item) => item.id === id);

const planted = [
  { name: "Asparagus in January", hard: ["out_of_season"], change: add({ id: "asparagus", quantity: "250g", name: "asparagus" }) },
  { name: "Fresh tomatoes in January", hard: ["out_of_season"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), { id: "tomatoes", quantity: "4", name: "tomatoes" }) },
  { name: "Fresh basil in January", hard: ["out_of_season"], change: (r) => r.seasoning.push({ id: "basil", name: "basil" }) },
  { name: "Avocado under another id", hard: ["banned_imported_fresh"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), { id: "olives", quantity: "2", name: "avocados" }) },
  { name: "Ingredient on neither list", hard: ["unknown_ingredient"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { id: "harissa", name: "harissa paste" }) },
  { name: "75 minutes of prep", hard: ["hands_on_cap"], change: (r) => (r.prep_minutes = 75) },
  { name: "Needs a slow cooker", hard: ["banned_kit"], change: (r) => (r.utensils = ["a slow cooker"]) },
  { name: "Chicken stock in a vegetarian page", hard: ["diet_label", "diet_slot"], change: (r) => Object.assign(ingredient(r, "vegetable-stock"), { id: "chicken-stock", name: "chicken stock" }) },
  { name: "Gluten free label with pearl barley", hard: ["gluten_label"], change: (r) => Object.assign(ingredient(r, "butter-beans"), { id: "pearl-barley", quantity: "150g", name: "pearl barley" }) },
  { name: "Hero ingredient missing", hard: ["missing_hero"], change: (r) => (r.ingredients = r.ingredients.filter((item) => item.id !== "leeks")) },
  { name: "Protein powder under the oats id", hard: ["banned_ultra_processed"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { id: "oats", quantity: "2 scoops", name: "protein powder" }) },
  { name: "Salmon under the trout id", hard: ["banned_expensive"], change: add({ id: "trout", quantity: "4", name: "salmon fillets" }) },
  {
    name: "Twelve ingredients",
    hard: ["too_many_ingredients"],
    change: add({ id: "carrots", quantity: "2", name: "carrots" }, { id: "celeriac", quantity: "1/2", name: "celeriac" }, { id: "kale", quantity: "200g", name: "kale" }),
  },
  { name: "Ingredient lines overflow the column", hard: ["column_overflow"], change: (r) => r.ingredients.forEach((item) => (item.name = `${item.name}, washed and roughly chopped`)) },
  { name: "Ingredients and seasoning overflow their shared column", hard: ["column_overflow"], change: (r) => {
      r.title = "Leek, potato and butter bean stew with wholegrain mustard";
      // Ten ingredients and five seasonings fit as single lines, so two of them have to wrap to overflow.
      r.ingredients.push({ id: "carrots", quantity: "2", name: "carrots, scrubbed and cut into chunks" });
      r.ingredients.find((item) => item.id === "leeks").name = "leeks, trimmed, washed and sliced";
      r.seasoning.push({ id: "cumin", name: "cumin" }, { id: "smoked-paprika", name: "smoked paprika" });
    },
  },
  { name: "Method overflows the page", hard: ["method_overflow"], change: (r) => (r.steps = r.steps.map((step) => `${step} Take your time over this and keep an eye on the pan so that nothing catches on the bottom.`)) },
  { name: "Salt listed as an ingredient", hard: ["seasoning_list"], change: add({ id: "salt", quantity: "1 tsp", name: "salt" }) },
  { name: "Dash joining clauses", hard: ["dashes"], change: (r) => (r.steps[3] = "Off the heat, stir in the crème fraîche — season well.") },
  { name: "Oven dish on a one pot date", hard: ["kit_slot"], change: (r) => (r.kit = "oven") },

  { name: "Jar of cooking sauce under the mustard id", judge: ["grandparents_cupboard", "honest_ingredients"], change: (r) => { Object.assign(ingredient(r, "wholegrain-mustard"), { quantity: "450g", name: "white wine sauce" }); r.steps[2] = "Stir in the drained beans and the pouch of sauce. Simmer without the lid for 5 minutes."; } },
  {
    name: "Would not work: far too salty and raw",
    judge: ["works"],
    change: (r) => {
      ingredient(r, "vegetable-stock").quantity = "100ml";
      r.steps[0] = "Warm the oil in a large pan. Soften the sliced leeks and chopped onion with 4 tbsp of salt for 10 minutes.";
      r.steps[1] = "Add the crushed garlic, potatoes in chunks, thyme and stock. Simmer for 3 minutes.";
    },
  },
  {
    name: "Ten minutes claimed for an hour of work",
    judge: ["honest_times"],
    change: (r) => {
      Object.assign(r, { prep_minutes: 10, cook_minutes: 25 });
      ingredient(r, "potatoes").quantity = "2kg";
      r.steps[0] = "Warm the oil in a large pan. Cook the leeks and onion for 40 minutes, stirring the whole time, until jammy.";
      r.steps[1] = "Add the garlic, the potatoes peeled and cut into 5mm dice, thyme and stock. Cover and simmer for 20 minutes.";
    },
  },
  { name: "Steps use unlisted summer ingredients", judge: ["honest_ingredients"], change: (r) => (r.steps[3] = "Stir in the crème fraîche, cherry tomatoes and basil.") },
  {
    name: "Restaurant language",
    judge: ["plain_voice"],
    change: (r) => {
      r.title = "Fondant of alliums, pomme cassée, haricot beurre";
      r.steps[0] = "Sweat the alliums in the oil à l'étuvée until translucent, avoiding any Maillard coloration.";
      r.steps[3] = "Mount with the crème fraîche off the heat, rectify the seasoning and nappe into warmed bowls.";
    },
  },
  { name: "Specialist kit", judge: ["basic_kitchen"], change: (r) => { r.utensils = ["one large pan", "a chinois", "a cream whipper siphon"]; r.steps[3] = "Strain through a chinois and foam it from the siphon."; } },
  { name: "Hero is only a garnish", judge: ["seasonal_feel"], change: (r) => { Object.assign(ingredient(r, "leeks"), { quantity: "1 small", name: "leek" }); r.title = "Potato and butter bean stew"; r.steps[0] = "Warm the oil in a large pan. Soften the chopped onion with a pinch of salt for 10 minutes."; r.steps[3] = "Off the heat, stir in the crème fraîche. Season and top with a few shreds of leek."; } },
  { name: "Farm shop ingredients", judge: ["supermarket"], change: (r) => { ingredient(r, "potatoes").name = "farm shop Pink Firs"; ingredient(r, "creme-fraiche").name = "raw Jersey cream"; } },
];

const cases = [{ name: "Control: the good page", control: true, change: () => {} }, ...planted].map((entry) => {
  const recipe = structuredClone(base);
  entry.change(recipe);
  return { ...entry, recipe, failures: hardChecks(recipe, slot) };
});

const row = (ok, name, detail) => console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
let missed = 0;
const tally = (ok) => (missed += ok ? 0 : 1);

console.log("Hard checks\n");
for (const entry of cases) {
  const codes = entry.failures.map((failure) => failure.code);
  const ok = entry.hard ? entry.hard.some((code) => codes.includes(code)) : codes.length === 0;
  tally(ok);
  row(ok, entry.name, entry.hard ? `wanted ${entry.hard.join(" or ")}, got ${codes.join(", ") || "nothing"}` : codes.join(", ") || "passes, as it should");
}

if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log("\nJudge\n");
  const forJudge = cases.filter((entry) => !entry.hard);
  const judgements = await pool(forJudge, 5, (entry) => judge(slot, entry.recipe));
  forJudge.forEach((entry, i) => {
    const failed = CRITERIA.filter((name) => !judgements[i][name].pass);
    const ok = entry.control ? failed.length === 0 : entry.judge.some((name) => failed.includes(name));
    tally(ok);
    row(ok, entry.name, entry.control ? failed.join(", ") || "passes every criterion" : `wanted ${entry.judge.join(" or ")}, got ${failed.join(", ") || "nothing"}`);
    for (const name of failed) console.log(`    ${name}: ${judgements[i][name].reason}`);
  });
} else {
  console.log("\nNo API key set, so the judge half was skipped.");
}

console.log(missed ? `\n${missed} planted problems were missed.` : "\nEvery planted problem was caught.");
if (missed) process.exitCode = 1;
