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
  intro: "Leeks are at their sweetest after a frost, and January is when they earn their keep. This is a warm bowl for a cold night.",
  meal: "dinner",
  dish_form: "stew",
  diet: "vegetarian",
  gluten_free: true,
  kit: "one_pot",
  utensils: ["Large lidded pan"],
  hands_on_minutes: 15,
  total_minutes: 45,
  serves: 4,
  best_time: "evening",
  freezes: true,
  ingredients: [
    { id: "olive-oil", name: "Olive oil", quantity: "2 tbsp", prep: "" },
    { id: "leeks", name: "Leeks", quantity: "4", prep: "washed and thickly sliced" },
    { id: "onions", name: "Onion", quantity: "1", prep: "chopped" },
    { id: "garlic", name: "Garlic", quantity: "2 cloves", prep: "crushed" },
    { id: "potatoes", name: "Potatoes", quantity: "600g", prep: "cut into chunks, skins on" },
    { id: "thyme", name: "Thyme", quantity: "4 sprigs", prep: "" },
    { id: "vegetable-stock", name: "Vegetable stock", quantity: "800ml", prep: "" },
    { id: "butter-beans", name: "Tinned butter beans", quantity: "2 x 400g tins", prep: "drained" },
    { id: "wholegrain-mustard", name: "Wholegrain mustard", quantity: "1 tbsp", prep: "" },
    { id: "creme-fraiche", name: "Crème fraîche", quantity: "4 tbsp", prep: "" },
    { id: "salt", name: "Salt", quantity: "1/2 tsp", prep: "" },
    { id: "black-pepper", name: "Black pepper", quantity: "a good grind", prep: "" },
  ],
  steps: [
    "Heat the oil in a large pan over a medium heat. Add the leeks, onion and a pinch of the salt, then cook for 8 to 10 minutes, stirring now and then, until soft and sweet but not browned.",
    "Stir in the garlic, potatoes and thyme and cook for 1 minute.",
    "Pour in the stock, bring to the boil, then cover and simmer for 20 minutes until the potatoes are tender when poked with a knife.",
    "Add the butter beans and mustard and simmer without the lid for 5 minutes. Crush a few potatoes against the side of the pan to thicken the stew.",
    "Take off the heat, stir in the crème fraîche, season with the rest of the salt and the pepper, and serve in warm bowls.",
  ],
  tip: "Keeps for 3 days in the fridge and tastes better on day two.",
};

const add = (...ingredients) => (recipe) => recipe.ingredients.push(...ingredients);
const ingredient = (recipe, id) => recipe.ingredients.find((item) => item.id === id);

const planted = [
  { name: "Asparagus in January", hard: ["out_of_season"], change: add({ id: "asparagus", name: "Asparagus", quantity: "250g", prep: "trimmed" }) },
  { name: "Fresh tomatoes in January", hard: ["out_of_season"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), { id: "tomatoes", name: "Tomatoes", quantity: "4", prep: "chopped" }) },
  { name: "Avocado under another id", hard: ["banned_imported_fresh"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), { id: "olives", name: "Avocado", quantity: "2", prep: "sliced" }) },
  { name: "Ingredient on neither list", hard: ["unknown_ingredient"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { id: "harissa", name: "Harissa paste" }) },
  { name: "Serves two", hard: ["serves"], change: (r) => (r.serves = 2) },
  { name: "75 minutes hands-on", hard: ["hands_on_cap"], change: (r) => Object.assign(r, { hands_on_minutes: 75, total_minutes: 90 }) },
  { name: "Needs a slow cooker", hard: ["banned_kit"], change: (r) => (r.utensils = ["Slow cooker"]) },
  { name: "Chicken stock in a vegetarian page", hard: ["diet_label", "diet_slot"], change: (r) => Object.assign(ingredient(r, "vegetable-stock"), { id: "chicken-stock", name: "Chicken stock" }) },
  { name: "Gluten free label with pearl barley", hard: ["gluten_label"], change: (r) => Object.assign(ingredient(r, "butter-beans"), { id: "pearl-barley", name: "Pearl barley", quantity: "150g", prep: "" }) },
  { name: "Hero ingredient missing", hard: ["missing_hero"], change: (r) => (r.ingredients = r.ingredients.filter((item) => item.id !== "leeks")) },
  { name: "Protein powder under the oats id", hard: ["banned_ultra_processed"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { id: "oats", name: "Unflavoured protein powder", quantity: "2 scoops" }) },
  { name: "Salmon under the trout id", hard: ["banned_expensive"], change: add({ id: "trout", name: "Salmon fillets", quantity: "4", prep: "" }) },
  {
    name: "Sixteen ingredients",
    hard: ["too_many_ingredients"],
    change: add(
      { id: "carrots", name: "Carrots", quantity: "2", prep: "sliced" },
      { id: "rosemary", name: "Rosemary", quantity: "1 sprig", prep: "" },
      { id: "sage", name: "Sage", quantity: "4 leaves", prep: "" },
      { id: "bay", name: "Bay leaf", quantity: "1", prep: "" },
    ),
  },
  { name: "Dash joining clauses", hard: ["dashes"], change: (r) => (r.steps[1] = "Stir in the garlic, potatoes and thyme — cook for 1 minute.") },
  { name: "Oven dish on a one pot date", hard: ["kit_slot"], change: (r) => (r.kit = "oven") },

  { name: "Jar of cooking sauce under the mustard id", judge: ["grandparents_cupboard", "honest_ingredients"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { name: "Creamy white wine cooking sauce", quantity: "1 x 450g pouch" }) },
  {
    name: "Would not work: far too salty and raw",
    judge: ["works"],
    change: (r) => {
      ingredient(r, "salt").quantity = "4 tbsp";
      ingredient(r, "vegetable-stock").quantity = "100ml";
      r.steps[2] = "Pour in the stock, bring to the boil, then simmer for 3 minutes.";
    },
  },
  {
    name: "Ten minutes claimed for an hour of work",
    judge: ["honest_times"],
    change: (r) => {
      Object.assign(r, { hands_on_minutes: 10, total_minutes: 40 });
      Object.assign(ingredient(r, "potatoes"), { quantity: "2kg", prep: "peeled and cut into 5mm dice" });
      r.steps[0] = "Heat the oil in a large pan over a low heat. Add the leeks and onion and cook for 40 minutes, stirring the whole time so nothing catches, until deep golden and jammy.";
    },
  },
  { name: "Steps use unlisted summer ingredients", judge: ["honest_ingredients"], change: (r) => (r.steps[4] = "Take off the heat, stir in the crème fraîche, a handful of halved cherry tomatoes and plenty of torn fresh basil, season with the rest of the salt and the pepper, and serve.") },
  {
    name: "Restaurant language",
    judge: ["plain_voice"],
    change: (r) => {
      r.title = "Fondant of alliums, pomme purée cassée, haricot beurre";
      r.steps[0] = "Sweat the alliums in the oil à l'étuvée until translucent, taking care to avoid any Maillard coloration.";
      r.steps[4] = "Mount the sauce with the crème fraîche off the heat, rectify the seasoning and nappe into warmed bowls. Finish with a rocher of crème fraîche.";
    },
  },
  { name: "Specialist kit", judge: ["basic_kitchen"], change: (r) => { r.utensils = ["Large lidded pan", "Conical chinois sieve", "Cream whipper siphon with gas chargers"]; r.steps[4] = "Pass the stew through the chinois, load the liquid into the siphon with the crème fraîche, charge twice and foam it over the potatoes and beans. Season and serve."; } },
  { name: "Hero is only a garnish", judge: ["seasonal_feel"], change: (r) => { Object.assign(ingredient(r, "leeks"), { quantity: "1 tbsp", prep: "very finely sliced, to garnish" }); r.title = "Potato and butter bean stew"; r.intro = "A warm bowl for a cold night, made from the cupboard."; r.steps[0] = "Heat the oil in a large pan over a medium heat. Add the onion and a pinch of the salt, then cook for 8 to 10 minutes until soft."; r.steps[4] = "Take off the heat, stir in the crème fraîche, season with the rest of the salt and the pepper, and scatter the raw leek over each bowl."; } },
  { name: "Farm shop ingredients", judge: ["supermarket"], change: (r) => { ingredient(r, "potatoes").name = "Heritage Pink Fir Apple potatoes from a farm shop"; ingredient(r, "creme-fraiche").name = "Raw unpasteurised Jersey crème fraîche from a dairy"; } },
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
