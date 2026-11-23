import { hardChecks } from "./lib/checks.js";
import { pool } from "./lib/llm.js";
import { CRITERIA } from "./lib/schema.js";
import { judge } from "./judge.js";

const slot = {
  day: 14, date: "2027-01-14", label: "14 January", month: 1, meal: "dinner", form: "stew or casserole",
  diet: "vegetarian", gluten_free: false, heroes: ["leeks"], protein: null, protein_hint: "tinned beans or chickpeas",
  kit: "one_pot", pace: "standard",
};

const line = (id, quantity, name, prep = "") => ({ id, quantity, name, prep });

const base = {
  title: "Leek, potato and butter bean stew",
  meal: "dinner",
  dish_form: "stew",
  diet: "vegetarian",
  gluten_free: true,
  kit: "one_pot",
  utensils: ["large lidded pan"],
  prep_minutes: 20,
  cook_minutes: 35,
  time_note: "",
  best_time: "evening",
  freezes: true,
  ingredients: [
    line("olive-oil", "2 tbsp", "olive oil"),
    line("leeks", "4", "leeks", "washed and thickly sliced"),
    line("onions", "1", "onion", "chopped"),
    line("garlic", "2 cloves", "garlic", "crushed"),
    line("potatoes", "600g", "potatoes", "cut into chunks"),
    line("vegetable-stock", "800ml", "vegetable stock"),
    line("butter-beans", "2 tins", "butter beans", "drained"),
    line("wholegrain-mustard", "1 tbsp", "wholegrain mustard"),
    line("creme-fraiche", "4 tbsp", "crème fraîche"),
  ],
  seasoning: [line("salt", "1/2 tsp", "salt"), line("black-pepper", "", "black pepper", "to taste"), line("thyme", "4 sprigs", "thyme")],
  steps: [
    "Heat the oil in a large pan over a medium heat. Add the leeks, onion and a pinch of the salt, then cook for 8 to 10 minutes, stirring now and then, until soft and sweet but not browned.",
    "Stir in the garlic, potatoes and thyme and cook for 1 minute.",
    "Pour in the stock, bring to the boil, then cover and simmer for 20 minutes, until the potatoes are tender when poked with a knife.",
    "Add the butter beans and mustard and simmer without the lid for 5 minutes. Crush a few potatoes against the side of the pan to thicken the stew.",
    "Take off the heat, stir in the crème fraîche, season with the rest of the salt and the pepper, and serve in warm bowls.",
  ],
};

const add = (...ingredients) => (recipe) => recipe.ingredients.push(...ingredients);
const ingredient = (recipe, id) => recipe.ingredients.find((item) => item.id === id);

const planted = [
  { name: "Asparagus in January", hard: ["out_of_season"], change: add(line("asparagus", "250g", "asparagus", "trimmed")) },
  { name: "Fresh tomatoes in January", hard: ["out_of_season"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), line("tomatoes", "4", "tomatoes", "chopped")) },
  { name: "Fresh basil in January", hard: ["out_of_season"], change: (r) => r.seasoning.push(line("basil", "a handful", "basil")) },
  { name: "Avocado under another id", hard: ["banned_imported_fresh"], change: (r) => Object.assign(ingredient(r, "creme-fraiche"), line("olives", "2", "avocados", "sliced")) },
  { name: "Ingredient on neither list", hard: ["unknown_ingredient"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), { id: "harissa", name: "harissa paste" }) },
  { name: "75 minutes of prep", hard: ["hands_on_cap"], change: (r) => (r.prep_minutes = 75) },
  { name: "Needs a slow cooker", hard: ["banned_kit"], change: (r) => (r.utensils = ["slow cooker"]) },
  { name: "Chicken stock in a vegetarian page", hard: ["diet_label", "diet_slot"], change: (r) => Object.assign(ingredient(r, "vegetable-stock"), { id: "chicken-stock", name: "chicken stock" }) },
  { name: "Gluten free label with pearl barley", hard: ["gluten_label"], change: (r) => Object.assign(ingredient(r, "butter-beans"), line("pearl-barley", "150g", "pearl barley")) },
  { name: "Hero ingredient missing", hard: ["missing_hero"], change: (r) => (r.ingredients = r.ingredients.filter((item) => item.id !== "leeks")) },
  { name: "Protein powder under the oats id", hard: ["banned_ultra_processed"], change: (r) => Object.assign(ingredient(r, "wholegrain-mustard"), line("oats", "2 scoops", "protein powder")) },
  { name: "Salmon under the trout id", hard: ["banned_expensive"], change: add(line("trout", "4", "salmon fillets")) },
  {
    name: "Thirteen ingredients",
    hard: ["too_many_ingredients"],
    change: add(line("carrots", "2", "carrots"), line("celeriac", "1/2", "celeriac"), line("kale", "200g", "kale"), line("swede", "1/2", "swede")),
  },
  { name: "Ingredient list runs off the page", hard: ["list_overflow"], change: (r) => r.ingredients.forEach((item) => (item.prep = "washed well, trimmed and then roughly chopped into even pieces")) },
  { name: "Method runs off the page", hard: ["method_overflow"], change: (r) => (r.steps = r.steps.map((step) => `${step} Take your time over this and keep an eye on the pan so that nothing catches on the bottom while you get on with the next job.`)) },
  { name: "Salt listed as an ingredient", hard: ["seasoning_list"], change: (r) => r.ingredients.push(r.seasoning.shift()) },
  { name: "Stock listed as a seasoning", hard: ["seasoning_list"], change: (r) => r.seasoning.push(r.ingredients.splice(5, 1)[0]) },
  { name: "Dash joining clauses", hard: ["dashes"], change: (r) => (r.steps[1] = "Stir in the garlic, potatoes and thyme — cook for 1 minute.") },
  { name: "Oven dish on a one pot date", hard: ["kit_slot"], change: (r) => (r.kit = "oven") },

  { name: "Jar of cooking sauce under the mustard id", judge: ["grandparents_cupboard", "honest_ingredients"], change: (r) => { Object.assign(ingredient(r, "wholegrain-mustard"), { quantity: "450g pouch", name: "creamy white wine cooking sauce" }); r.steps[3] = r.steps[3].replace("mustard", "cooking sauce"); } },
  {
    name: "Would not work: far too salty and raw",
    judge: ["works"],
    change: (r) => {
      r.seasoning[0].quantity = "4 tbsp";
      ingredient(r, "vegetable-stock").quantity = "100ml";
      r.steps[2] = "Pour in the stock, bring to the boil, then simmer for 3 minutes.";
    },
  },
  {
    name: "Ten minutes claimed for an hour of work",
    judge: ["honest_times"],
    change: (r) => {
      Object.assign(r, { prep_minutes: 10, cook_minutes: 30 });
      Object.assign(ingredient(r, "potatoes"), { quantity: "2kg", prep: "peeled and cut into 5mm dice" });
      r.steps[0] = "Heat the oil in a large pan over a low heat. Add the leeks and onion and cook for 40 minutes, stirring the whole time so nothing catches, until deep golden and jammy.";
    },
  },
  { name: "Steps use unlisted summer ingredients", judge: ["honest_ingredients"], change: (r) => (r.steps[4] = "Take off the heat, stir in the crème fraîche, a handful of halved cherry tomatoes and plenty of torn fresh basil, season with the rest of the salt and the pepper, and serve.") },
  {
    name: "Restaurant language",
    judge: ["plain_voice"],
    change: (r) => {
      r.title = "Fondant of alliums, pomme cassée, haricot beurre";
      r.steps[0] = "Sweat the alliums in the oil à l'étuvée until translucent, taking care to avoid any Maillard coloration.";
      r.steps[4] = "Mount the sauce with the crème fraîche off the heat, rectify the seasoning and nappe into warmed bowls. Finish with a rocher of crème fraîche.";
    },
  },
  { name: "Specialist kit", judge: ["basic_kitchen"], change: (r) => { r.utensils = ["large lidded pan", "conical chinois sieve", "cream whipper siphon with gas chargers"]; r.steps[4] = "Pass the stew through the chinois, load the liquid into the siphon with the crème fraîche, charge twice and foam it over the potatoes and beans. Season and serve."; } },
  { name: "Hero is only a garnish", judge: ["seasonal_feel"], change: (r) => { Object.assign(ingredient(r, "leeks"), { quantity: "1 small", name: "leek", prep: "finely shredded" }); r.title = "Potato and butter bean stew"; r.steps[0] = "Heat the oil in a large pan over a medium heat. Add the onion and a pinch of the salt, then cook for 8 to 10 minutes until soft."; r.steps[4] = "Take off the heat, stir in the crème fraîche, season with the rest of the salt and the pepper, and top each bowl with a few shreds of raw leek."; } },
  { name: "Farm shop ingredients", judge: ["supermarket"], change: (r) => { ingredient(r, "potatoes").name = "farm shop Pink Fir Apple potatoes"; ingredient(r, "creme-fraiche").name = "raw Jersey crème fraîche"; } },
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
