// Compare print costs. Run: node --env-file=.env lulu/quote.mjs [pages] [qty]
const base = process.env.LULU_API_BASE ?? "https://api.sandbox.lulu.com";
const { LULU_CLIENT_KEY: key, LULU_CLIENT_SECRET: secret } = process.env;
const pages = Number(process.argv[2] ?? 366), qty = Number(process.argv[3] ?? 1);
const tok = await (await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
})).json();
const options = {
  "A5 BW paperback, 60# cream": "0583X0827BWSTDPB060UC444MXX",
  "A5 BW paperback, 60# white": "0583X0827BWSTDPB060UW444MXX",
  "A5 BW paperback, 80# white coated": "0583X0827BWSTDPB080CW444MXX",
  "A5 colour standard paperback, 80# white": "0583X0827FCSTDPB080CW444MXX",
  "A5 colour premium paperback, 80# white": "0583X0827FCPREPB080CW444MXX",
};
for (const [name, id] of Object.entries(options)) {
  const r = await fetch(`${base}/print-job-cost-calculations/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      line_items: [{ pod_package_id: id, page_count: pages, quantity: qty }],
      shipping_address: { city: "London", country_code: "GB", postcode: "SW1A 1AA", street1: "1 Test St", phone_number: "5555555555" },
      shipping_option: "MAIL",
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.log(`${name}: ERROR ${r.status} ${JSON.stringify(j).slice(0, 160)}`); continue; }
  const li = j.line_item_costs[0];
  console.log(`${name}\n   print/copy ${li.total_cost_excl_tax} | shipping ${j.shipping_cost.total_cost_excl_tax} | fulfilment ${j.fulfillment_cost.total_cost_excl_tax} | total incl tax ${j.total_cost_incl_tax} ${j.currency}`);
}
