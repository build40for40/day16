import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root } from "./data.js";

export function args() {
  const argv = process.argv.slice(2);
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    set: argv.includes("--all") ? "book" : (value("--set") ?? "sample"),
    all: argv.includes("--all"),
    force: argv.includes("--force"),
    fix: argv.includes("--fix"),
    days: value("--days")?.split(",").map(Number),
    concurrency: Number(value("--concurrency") ?? 6),
  };
}

export function plan() {
  const file = path.join(root, "out", "plan.json");
  if (!existsSync(file)) throw new Error("No plan yet. Run `npm run plan` first.");
  return JSON.parse(readFileSync(file, "utf8"));
}

export function sample(slots) {
  const meals = ["breakfast", "lunch", "dinner", "snack"];
  const picked = [];
  for (let month = 1; month <= 12; month++) {
    for (const [offset, from] of [[0, 4], [2, 17]]) {
      const meal = meals[(month - 1 + offset) % 4];
      picked.push(slots.find((slot) => slot.month === month && slot.meal === meal && Number(slot.date.slice(8)) >= from));
    }
  }
  return picked;
}

export function chosen(slots, { all, days }) {
  if (days) return slots.filter((slot) => days.includes(slot.day));
  return all ? slots : sample(slots);
}

export function dir(set, kind) {
  const folder = path.join(root, "out", set, kind);
  mkdirSync(folder, { recursive: true });
  return folder;
}

export function save(set, kind, slot, data) {
  writeFileSync(path.join(dir(set, kind), `${slot.date.slice(5)}.json`), JSON.stringify(data, null, 1) + "\n");
}

export function remove(set, kind, slot) {
  rmSync(path.join(dir(set, kind), `${slot.date.slice(5)}.json`), { force: true });
}

export function load(set, kind) {
  const folder = dir(set, kind);
  return readdirSync(folder)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(folder, file), "utf8")));
}
