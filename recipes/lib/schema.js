import { z } from "zod";

export const MEALS = ["breakfast", "lunch", "dinner", "snack"];
export const DIETS = ["vegan", "vegetarian", "fish", "meat"];
export const KITS = ["one_pot", "one_tray", "hob", "oven", "hob_and_oven", "no_cook"];

export const Recipe = z.object({
  title: z.string().describe("Plain name of the dish, as a home cook would say it"),
  intro: z.string().describe("One or two sentences on why this is the thing to cook at this time of year"),
  meal: z.enum(MEALS),
  dish_form: z.string().describe("The kind of dish, such as soup, traybake or porridge"),
  diet: z.enum(DIETS),
  gluten_free: z.boolean(),
  kit: z.enum(KITS),
  utensils: z.array(z.string()).describe("Every piece of equipment needed beyond a knife, board and spoon"),
  hands_on_minutes: z.number().int().describe("Minutes the cook is actively working"),
  total_minutes: z.number().int().describe("Minutes from starting to eating, including oven and resting time"),
  serves: z.number().int(),
  best_time: z.enum(["morning", "midday", "afternoon", "evening", "any time"]),
  freezes: z.boolean(),
  ingredients: z.array(
    z.object({
      id: z.string().describe("The id of this ingredient from the fresh list or the store cupboard list"),
      name: z.string().describe("The ingredient as printed on the page"),
      quantity: z.string().describe("Metric amount or count for four people, such as 400g, 2 or 1 tbsp"),
      prep: z.string().describe("Short preparation note such as 'finely sliced', or an empty string"),
    }),
  ),
  steps: z.array(z.string()),
  tip: z.string().describe("One short tip: a swap, a way to use leftovers or how long it keeps"),
});

export const CRITERIA = [
  "grandparents_cupboard",
  "supermarket",
  "basic_kitchen",
  "works",
  "honest_times",
  "honest_ingredients",
  "seasonal_feel",
  "plain_voice",
  "hearty_healthy",
];

const Verdict = z.object({
  pass: z.boolean(),
  reason: z.string().describe("One sentence. Name the specific ingredient, step or phrase behind a fail"),
});

export const Judgement = z.object(Object.fromEntries(CRITERIA.map((name) => [name, Verdict])));
