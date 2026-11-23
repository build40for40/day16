# Day 16

Day 16 of 40 for 40, built live on Twitch on Monday 23 November 2026. The problem is "Ultra processed food guilt", from Ritika. The answer is Seasoned: a daily, seasonal, local recipe book. Work is tracked on the Superthread `day16` board and the "Day 16 - plan & brief" page.

- **Form factor:** book. Games and data viz were weighed and dropped.
- **Name:** Seasoned. The repo stays `day16`.

- **Web page:** `index.html` is the single-page book site (one free seasonal recipe a day, or buy the book for all 365), with the Seasoned brand look by default and five other skins switched from the top right. It's served at `build40for40.com/seasoned/` by this repo's own Worker, `seasoned`, along with today's page from the book, shown centred at the bottom.
- **Today's page:** `npm run build` runs `build.ts`, which copies the 365 recipes and their pictures (resized to 800 px wide) into `dist/seasoned/`. There is no database. The Worker answers `/seasoned/api/today` with today's recipe drawn by `pages/page.ts`, the same code that lays out the book, and the page shows it in place of `sample-page.jpg`, which stays as the fallback. The day turns over at midnight in London. The Worker runs first on `/seasoned/recipes/*` and `/seasoned/pictures/*` and only lets today's picture through.
- **Free ebook:** the whole book is a free download at `/seasoned/seasoned.pdf`, linked under today's page. `npm run ebook` (`book/build.ts --ebook`) prints it with 680 px pictures, which keeps it near 19 MB, under the 25 MB Cloudflare serves. It runs anywhere with Chrome, so `npm run build` makes it in CI on every deploy and it always matches the recipes on `main`. `npm run dev` skips it. `npm run epub` (`book/epub.ts`) builds `/seasoned/seasoned.epub` the same way, for phones and e-readers. An EPUB reflows, so it doesn't use the A5 layout: it has the title and copyright pages, the introduction, a chapter a month and the closing pages, about 15 MB.
- **Buying:** the Buy buttons go to two Stripe Payment Links, one for the UK (£17.99 plus £4 delivery) and one for everywhere else (£17.99 plus £12, which covers Lulu's cost to the dearest country on the link). Delivery is a second line item, not a Stripe shipping rate. Everything in Stripe for the book carries `metadata.app = day16`.
- **Printing:** `worker/index.ts` takes Stripe's `checkout.session.completed` webhook at `/seasoned/api/stripe/webhook` and places the order with Lulu's Print API, using the Stripe session id as Lulu's `external_id` so a retried webhook never prints twice. Any failure answers Stripe with an error status, so it shows as a failed delivery in the Stripe dashboard. A Stripe sandbox payment goes to Lulu's sandbox and a live payment to Lulu production, each with its own keys (see `.dev.vars.example`), so the two never mix. The `vars` in `wrangler.jsonc` hold the book's files and Lulu package, which are Lulu's sample book until the real files exist. Don't add the production Lulu keys before then: without them a live order fails loudly instead of printing the sample.
- **Emails:** the Worker sends two plain emails through Postmark, one when the order goes to Lulu and one with the tracking link when Lulu's `PRINT_JOB_STATUS_CHANGED` webhook (at `/seasoned/api/lulu/webhook`) says it shipped. CI subscribes to that webhook on deploy. Without `POSTMARK_SERVER_TOKEN` no email is sent and orders still print.
- **Sandbox for now:** the Buy buttons on every host, `build40for40.com` included, go to the Stripe sandbox links, so nobody pays real money while live orders can't be printed. The live links exist and are unused: UK `https://buy.stripe.com/3cI7sLcWWfKl7Wj9bt7Zu0b`, everywhere else `https://buy.stripe.com/dRm4gz7CCfKl90n4Vd7Zu0c`. Going live means pointing the buttons at those on `build40for40.com` only and enabling the live Stripe webhook endpoint. Both Stripe webhook endpoints point at the production Worker, so a sandbox checkout from a preview is fulfilled by whatever is on `main`. Secrets live in the repo's GitHub Actions secrets and CI copies them onto the Worker on each deploy.
- **One package, npm:** the page is a static file, so the Worker and the `recipes/` scripts share a single `package.json`. `npm run dev` runs both locally, `npm test` runs the Worker tests, and merging to `main` deploys through CI.

- **Page format:** `npm run pages` runs `pages/build.ts`, which turns every recipe JSON in `recipes/out/sample/recipes/` into an A5 page (148 × 210 mm, 559 × 794 px, set to Lulu's interior margins: 25 mm on the binding side and 13 mm on the other three) in `pages/out/`, plus `book.html` holding all of them in date order for printing to PDF. `--in`, `--out` and `--pictures` point it at other folders. `npm run pages:book` does the same for all 365 recipes in `recipes/out/book/recipes/`, into `pages/out/book/`. The layout itself is `pages/page.ts`. All 365 fit the page, the tightest with 2 px to spare. The generator's page model (the `page` block in `recipes/config.json` and the letter widths in `recipes/data/glyphs.json`) is measured from this layout in Figtree, so `npm run check` agrees with the built pages. If the layout or typeface changes, both need measuring again. The pages follow the Seasoned brand guidelines, on a white page so the book prints in black and white: Figtree type, Cavolo nero text, and one pop of colour per page, the ingredients badge in the season's main colour. The ingredients start at the same height on every page. Each page has a landscape picture, the title, utensils, time split into prep and cook, ingredients with seasoning as its own section underneath, and the method. The right-hand edge is what you see when you flick: the date over the day number, and four season icons on a year line that runs to the foot of the page, with winter at both ends and a dot on today. A picture named like its recipe (`pictures/11-06.jpg`) is placed automatically, and a grey box stands in until then. All 24 current samples fit. Odd days are right-hand pages and even days are left-hand pages, where the edge moves to the left and everything else keeps its place. `--first-side left` swaps them.
- **The whole book:** `npm run book` runs `book/build.ts`. It wraps the 365 built recipe pages in the front pages (half title, title, copyright, contents, how to read a page, introduction) and the back pages (an index by ingredient and by meal, acknowledgements, about, the waitlist page and notes pages), then prints the lot to PDF with Chrome. Output goes to `dist/book/`, which git ignores: `seasoned-interior.pdf` in colour and `seasoned-interior-bw.pdf` with grey pictures. All the wording is in `book/copy.json`. The introduction and about page there are drafts. Run `npm run pages:book` first. It needs macOS for `sips` and Google Chrome.
- **Architecture:** `design/workshop.html` is a diagram of the whole build as an elf workshop, with each part marked on main, PR open, in progress or not built. The statuses are a snapshot from 23 November.
- **Book design:** `book/design.html` is the design board for the printed book (cover options, title and copyright pages, a sample spread, print spec). `book/README.md` explains it.

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

## Recipe generation

`recipes/` writes and checks the 365 pages. It needs `ANTHROPIC_API_KEY` in a `.env` file at the repo root (see `.env.example`).

| Command | What it does |
| --- | --- |
| `npm run plan` | Lays out 365 dated slots in `recipes/out/plan.json`: meal, diet, hero ingredient, suggested dish. No API calls |
| `npm run generate` | Writes the 24-page sample (two per month). Add `-- --all` for the whole book, `-- --days 14,200` for single days, `-- --force` to rewrite, `-- --fix` to rewrite pages the judge failed |
| `npm run judge` | Scores pages against the rubric in `recipes/prompts/judge.md`. Takes the same flags |
| `npm run check` | Re-runs the hard checks and writes `recipes/out/<set>/report.md` with the spread across the book. Add `-- --all` for the book |
| `npm run planted` | Runs deliberately bad pages through the checks and the judge, to prove they catch them |

- **Seasons:** `recipes/data/seasonal.csv` is the source of truth for what is fresh in each month, and `recipes/data/pantry.csv` for year-round staples. A recipe can only use ids from those two files.
- **Rules and limits:** `recipes/config.json` holds the meal split, targets, page limits and banned words.
- **Prompts:** `recipes/prompts/recipe.md` and `recipes/prompts/judge.md`.
