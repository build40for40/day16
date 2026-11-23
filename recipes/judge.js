import { ask, pool, usage } from "./lib/llm.js";
import { judgeSystem, judgeUser } from "./lib/prompt.js";
import { CRITERIA, Judgement } from "./lib/schema.js";
import { args, load, save } from "./lib/store.js";

export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-opus-5-5";

export function judge(slot, recipe, system = judgeSystem()) {
  return ask({ model: JUDGE_MODEL, system, user: judgeUser(slot, recipe), schema: Judgement, effort: "high" });
}

if (import.meta.main) {
  const options = args();
  const done = new Set(options.force ? [] : load(options.set, "judge").map((entry) => entry.day));
  const todo = load(options.set, "recipes").filter(
    (page) => !done.has(page.slot.day) && (!options.days || options.days.includes(page.slot.day)),
  );
  const system = judgeSystem();
  console.log(`Judging ${todo.length} pages in the "${options.set}" set with ${JUDGE_MODEL}`);

  await pool(todo, options.concurrency, async (page) => {
    try {
      const judgement = await judge(page.slot, page.recipe, system);
      save(options.set, "judge", page.slot, { day: page.slot.day, title: page.recipe.title, model: JUDGE_MODEL, judgement });
      const failed = CRITERIA.filter((name) => !judgement[name].pass);
      console.log(`${page.slot.label}: ${page.recipe.title}: ${failed.length ? `fails ${failed.join(", ")}` : "ok"}`);
    } catch (error) {
      console.log(`${page.slot.label}: judge errored: ${error.message}`);
    }
  });

  console.log(`Done. ${usage.calls} calls, ${usage.input} input tokens (${usage.cached} from cache), ${usage.output} output tokens.`);
}
