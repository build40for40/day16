import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const [key, model = "gemini-3.1-flash-image"] = process.argv.slice(2);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const { slot, recipe: r } = JSON.parse(readFileSync(`recipes/out/sample/recipes/${key}.json`, "utf8"));
const template = readFileSync("pictures/prompts/picture.md", "utf8");
const fill = (v) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in v)) throw new Error(k); return v[k]; });
const styles = readdirSync("pictures/prompts/styles").filter((f) => f.endsWith(".md"));
await Promise.all(styles.map(async (file) => {
  const prompt = fill({
    TITLE: r.title, DISH: r.dish_form, MEAL: r.meal, MONTH: MONTHS[slot.month - 1],
    INGREDIENTS: r.ingredients.map((i) => `${i.quantity} ${i.name}`).join(", "),
    SEASONING: r.seasoning.map((s) => s.name).join(", ") || "none",
    UTENSILS: r.utensils.join(", "),
    STEPS: r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    STYLE: readFileSync(`pictures/prompts/styles/${file}`, "utf8").trim(),
  });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } }),
  });
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) return console.log(file, "FAILED", JSON.stringify(json).slice(0, 400));
  const ext = part.inlineData.mimeType.split("/")[1].replace("jpeg", "jpg");
  const out = `pictures/samples/${key}-${file.replace(".md", "")}.${ext}`;
  writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
  console.log(out, JSON.stringify(json.usageMetadata?.candidatesTokenCount));
}));
