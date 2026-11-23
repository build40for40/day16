import { hardChecks } from "./lib/checks.js";
import { ask, pool, usage } from "./lib/llm.js";
import { recipeSystem, recipeUser } from "./lib/prompt.js";
import { CRITERIA, Recipe } from "./lib/schema.js";
import { args, chosen, load, plan, remove, save } from "./lib/store.js";

const MODEL = process.env.RECIPE_MODEL ?? "claude-opus-5-5";
const ATTEMPTS = 3;

const options = args();
const existing = new Map(load(options.set, "recipes").map((page) => [page.slot.day, page]));
const judgeFailures = new Map(
  load(options.set, "judge")
    .map((entry) => [
      entry.day,
      CRITERIA.filter((name) => !entry.judgement[name].pass).map((name) => ({ code: name, message: entry.judgement[name].reason })),
    ])
    .filter(([, failures]) => failures.length),
);
const todo = options.fix
  ? [...existing.values()].filter((page) => judgeFailures.has(page.slot.day)).map((page) => page.slot)
  : chosen(plan(), options).filter((slot) => options.force || !existing.has(slot.day));
const system = recipeSystem();

console.log(`Writing ${todo.length} pages into the "${options.set}" set with ${MODEL}`);

await pool(todo, options.concurrency, async (slot) => {
  const taken = [...existing.values()]
    .filter((page) => page.slot.day !== slot.day && (page.slot.heroes[0] === slot.heroes[0] || page.slot.meal === slot.meal))
    .map((page) => page.recipe.title);
  let rejected = options.fix ? { recipe: existing.get(slot.day).recipe, failures: judgeFailures.get(slot.day) } : undefined;
  let page;
  const rejections = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let recipe;
    try {
      recipe = await ask({ model: MODEL, system, user: recipeUser(slot, { taken, rejected }), schema: Recipe });
    } catch (error) {
      console.log(`${slot.label}: attempt ${attempt} errored: ${error.message}`);
      continue;
    }
    const failures = hardChecks(recipe, slot);
    page = { slot, recipe, attempts: attempt, rejections, failures, model: MODEL };
    if (!failures.length) break;
    rejections.push(failures.map((failure) => failure.message));
    rejected = { recipe, failures };
  }
  if (!page) return console.log(`${slot.label}: no page written`);
  existing.set(slot.day, page);
  save(options.set, "recipes", slot, page);
  remove(options.set, "judge", slot);
  const status = page.failures.length ? `STILL FAILING ${page.failures.map((failure) => failure.code).join(", ")}` : "ok";
  console.log(`${slot.label}: ${page.recipe.title} (${page.attempts} attempt${page.attempts > 1 ? "s" : ""}, ${status})`);
});

console.log(`Done. ${usage.calls} calls, ${usage.input} input tokens (${usage.cached} from cache), ${usage.output} output tokens.`);
