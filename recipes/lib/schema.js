import { z } from "zod";

export const MEALS = ["breakfast", "lunch", "dinner", "snack"];
export const DIETS = ["vegan", "vegetarian", "fish", "meat"];
export const KITS = ["one_pot", "one_tray", "hob", "oven", "hob_and_oven", "no_cook"];

export const Recipe = z.object({
  title: z.string().describe("Plain name of the dish, as a home cook would say it"),
  meal: z.enum(MEALS),
  dish_form: z.string().describe("The kind of dish, such as soup, traybake or porridge"),
  diet: z.enum(DIETS),
  gluten_free: z.boolean(),
  kit: z.enum(KITS),
  utensils: z.array(z.string()).describe("The pans and tools needed, each as a short lower case phrase such as 'one heavy pan'"),
  prep_minutes: z.number().int().describe("Minutes the cook is actively working: peeling, chopping, stirring, assembling"),
  cook_minutes: z.number().int().describe("Minutes it cooks, rests or chills without needing attention"),
  time_note: z.string().describe("Anything to do ahead, such as 'oats soaked overnight', or an empty string"),
  best_time: z.enum(["morning", "midday", "afternoon", "evening", "any time"]),
  freezes: z.boolean(),
  seasoning: z.array(
    z.object({
      id: z.string().describe("The id from the fresh list or the store cupboard list"),
      name: z.string().describe("Lower case name as printed, such as 'thyme'"),
    }),
  ),
  ingredients: z.array(
    z.object({
      id: z.string().describe("The id of this ingredient from the fresh list or the store cupboard list"),
      quantity: z.string().describe("Metric amount or count for four people, such as 400g, 2 or 1 tbsp"),
      name: z.string().describe("Lower case name as printed after the quantity, such as 'leeks'"),
    }),
  ),
  steps: z.array(z.string()),
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
