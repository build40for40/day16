# Seasoned: book design

`design.html` is the design board for the printed book. Open it in a browser (it needs internet for the Google Fonts).

**Seasoned: A European Year of Cooking, One Day at a Time.** By Benjamin Bourdin, Lawrence Kao and Samira Sohail. Published by 40 for 40 Ltd, printed on demand by Lulu.

What is on the board:

- **Three cover options.** A green cloth with gold foil, B ivory and oxblood, C almanac in navy. We are leaning to **B** because it is the most minimal.
- **Title page and copyright page**, with the ISBN, the Lulu imprint and the note on the recipes. The copyright page is black text only.
- **A sample interior spread** for 23 November (day 327). This is only a stand-in. The real recipe pages are the A5 (148 × 210 mm) pages that `npm run pages` builds from `pages/`, so the cover and title pages should be matched to those, not the other way round.
- **The print spec**: format, typefaces, binding and structure.

The spiral illustration is drawn in code (a script at the bottom of `design.html`), in the colours of the spice rack: cinnamon, paprika, saffron and turmeric.

Things still to settle: which cover (B is the lead), matching the title and copyright pages to the page builder's typeface and margins, and the final cover artwork on Lulu's A5 hardback template.
