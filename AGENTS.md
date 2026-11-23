# Day 16

Day 16 of 40 for 40, built live on Twitch on Monday 23 November 2026. The problem is "Ultra processed food guilt", from Ritika. The answer is Seasoned: a daily, seasonal, local recipe book. Work is tracked on the Superthread `day16` board and the "Day 16 - plan & brief" page.

- **Form factor:** book. Games and data viz were weighed and dropped.
- **Name:** Seasoned. The repo stays `day16`.

- **Web page:** `index.html` is the single-page book site (one free seasonal recipe a day, or buy the book for all 365), with five skins switched from the top right. It's served at `build40for40.com/seasoned/` by this repo's own Worker, `seasoned`.
- **Buying:** the Buy buttons go to two Stripe Payment Links, one for the UK (£12 plus £4 delivery) and one for everywhere else (£12 plus £8). Delivery is a second line item, not a Stripe shipping rate. Everything in Stripe for the book carries `metadata.app = day16`.
- **Printing:** `worker/index.ts` takes Stripe's `checkout.session.completed` webhook at `/seasoned/api/stripe/webhook` and places the order with Lulu's Print API, using the Stripe session id as Lulu's `external_id` so a retried webhook never prints twice. Any failure answers Stripe with an error status, so it shows as a failed delivery in the Stripe dashboard. The `vars` in `wrangler.jsonc` point at Lulu's sandbox and its sample book; going live means swapping them for `https://api.lulu.com` and the real files, and setting the three secrets in `.dev.vars.example`.
- **One package, npm:** the page is a static file and the Worker is the only code, so there is a single `package.json`. `npm run dev` runs both locally, `npm test` runs the Worker tests, and merging to `main` deploys through CI.

Shared 40 for 40 context lives in `../AGENTS.md`.

## The problem

Ultra processed foods guilt

When food shopping or ordering groceries online, I am always aware of trying to cut down on ultra processed foods, and added ingredients that can be avoided. I want my food shop, either online or in person, to be audited to show which foods are highly processed, what alternatives I can buy, how local is the product, and ideally link to a meal plan to meet nutritional goals

## From the brief and plan

A summary of the team's planning call, from the Superthread "Day 16 - plan & brief" page. That page is the source.

### Who and when

A health-conscious person who cares what goes into their body and wants to be educated, but also wants convenience. The target reader is a family with little time, such as a mother of three. It matters whenever they shop, in the supermarket or online.

### Decisions

- Do the book. Several people wanted something physical and screen-free in the kitchen, and a book is published once and stays evergreen.
- 365 days, one recipe per page, rotating breakfast, lunch, dinner and snack. The first book mixes all types.
- Always in season and local.
- Not vegan or vegetarian only, but a good mix.
- Tone: basic and normal, no fancy ingredients.
- Guilt-free: if you miss a day, you carry on with the day you're on, like The Daily Stoic.
- Why a book answers a processed food problem: nobody cuts out processed food overnight, so it builds the muscle gradually and takes the thinking out of it.
- The book is essentially a PDF and could be ready to buy the same day. Printing takes longer, so presales and a waitlist are options.
- Fake doors for other books (365 lunches, daily dinner) and content marketing could test demand.

### Recipe constraints

- **Kitchen:** basic, no fancy utensils. One pot or one tray comes up on rotation, but isn't a rule.
- **Ingredients:** simple, and found in a mainstream supermarket.
- **Serves:** four.
- **Time:** quick, with about 15 minutes of hands-on time. Longer oven or one-pot cooks are fine.
- **Cost:** capped at £4.40 per person. No caviar, oysters or expensive salmon.
- **Variety:** soups, stews, pies, grains, lentils.
- **Ultra processed:** no "all natural" claim. Roughly, anything you wouldn't find in a supermarket or home kitchen is out. Tomato paste, chopped tomatoes, sauce and beans are fine, and an ingredient list under five is okay. The proper definition is still to be written.

### Pages

- Metadata still to define: cook time, utensils, suggested time of day to eat, and others.
- Consistent but creative, not all identical.
- Size undecided, with small preferred over big.
- Photos are generated with AI in a sketch style, not taken from elsewhere.

### Ideas left out

Copying an expert's basket, healthy-eating games and top trumps, modernised grandma's recipes, atomic recipes (one healthier swap per recipe), a basket food-miles score, an ingredient transparency visualisation, recipe trading cards and a receipt optimiser.

### Next steps

- Find out how to make and publish a book.
- Visuals, landing page and branding, already started.
- Recipe generator prompt.
- Publishing, stock photos and page format.
- Write the ultra processed definition.

### Initial units of work

Each has a card on the `day16` board.

- Branding and landing page.
- Recipe gen.
- Book publishing.
- Stock photo gen.
- Page format and book structure.
- Intro and glossary: the rationale.
