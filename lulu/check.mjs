// Fetches a Lulu OAuth token and prints a cost quote. Run: node --env-file=.env lulu/check.mjs
const base = process.env.LULU_API_BASE ?? "https://api.sandbox.lulu.com";
const { LULU_CLIENT_KEY: key, LULU_CLIENT_SECRET: secret } = process.env;
if (!key || !secret) throw new Error("Set LULU_CLIENT_KEY and LULU_CLIENT_SECRET in .env");

const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) throw new Error(`Token failed: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();
console.log("Token OK against", base);

// Placeholder quote: 6x9 US Trade, black & white, 80# white, paperback, 365 pages. Adjust to the real book.
const costRes = await fetch(`${base}/print-job-cost-calculations/`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    line_items: [{ pod_package_id: "0600X0900BWSTDPB080CW444GXX", page_count: 365, quantity: 1 }],
    shipping_address: { city: "New York", country_code: "US", postcode: "10001", state_code: "NY", street1: "1 Test St", phone_number: "5555555555" },
    shipping_option: "MAIL",
  }),
});
console.log(costRes.status, JSON.stringify(await costRes.json(), null, 2));
