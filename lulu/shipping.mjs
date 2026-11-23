// Quote Lulu shipping to several countries. Run: node --env-file=.env lulu/shipping.mjs [pages] [qty]
const base = process.env.LULU_API_BASE ?? "https://api.sandbox.lulu.com";
const { LULU_CLIENT_KEY: key, LULU_CLIENT_SECRET: secret } = process.env;
const pages = Number(process.argv[2] ?? 366), qty = Number(process.argv[3] ?? 1);
const tok = await (await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
})).json();
const dests = [
  ["UK", "GB", "London", "SW1A 1AA", ""],
  ["Ireland", "IE", "Dublin", "D02 X285", ""],
  ["Germany", "DE", "Berlin", "10115", ""],
  ["France", "FR", "Paris", "75001", ""],
  ["USA", "US", "New York", "10001", "NY"],
  ["Canada", "CA", "Toronto", "M5H 2N2", "ON"],
  ["Australia", "AU", "Sydney", "2000", "NSW"],
  ["New Zealand", "NZ", "Auckland", "1010", ""],
  ["Japan", "JP", "Tokyo", "100-0001", ""],
  ["India", "IN", "Mumbai", "400001", "MH"],
  ["Brazil", "BR", "Sao Paulo", "01001-000", "SP"],
  ["South Africa", "ZA", "Cape Town", "8001", ""],
];
const levels = ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"];
for (const [name, cc, city, zip, st] of dests) {
  const out = [];
  for (const lvl of levels) {
    const r = await fetch(`${base}/print-job-cost-calculations/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        line_items: [{ pod_package_id: "0583X0827BWSTDPB060UW444MXX", page_count: pages, quantity: qty }],
        shipping_address: { city, country_code: cc, postcode: zip, state_code: st || undefined, street1: "1 Test St", phone_number: "5555555555" },
        shipping_option: lvl,
      }),
    });
    const j = await r.json();
    if (r.ok) out.push(`${lvl} £${j.shipping_cost.total_cost_excl_tax}`);
  }
  console.log(name.padEnd(12), out.join(" | ") || "no options / error");
}
