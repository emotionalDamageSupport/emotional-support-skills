# Visual check against a reference

Shared reference for `frontend-verify` (step 6) and `blackbox-qa` (branch "design review against a mockup"). The calling skill chooses the reference; in `blackbox-qa` it is only mockups and product requirements.

A passing scenario and a clean console don't prove design conformance. The proof is a comparison under the same conditions, and measurements.

## Order

1. **Conditions.** The reference and the screen under check at the same window size and zoom. Write the sizes down. Check the working width and the narrowest supported width for this interface (from the requirements or the project's instructions).
2. **Two views.** The whole screen and a close-up of the affected block: small deviations get lost in a full screenshot. Look at the close-up first.
3. **Geometry.** Outer and inner spacing (margin, padding, gap); widths and max-width of containers, fields and buttons; heights; alignment of edges and baselines; typography (size, line height, weight); text wrapping.
4. **Flex/grid.** Fields and buttons stretched without reason; squeezed labels; extra empty space; clipping; overlap; horizontal scroll.
5. **Edge states** of the changed blocks that the real data allows: long text, empty data, many rows, validation messages. List the states you couldn't reach.
6. **Texts and locales.** Displayed texts against their sources; substitutions; raw translation keys. For each affected locale — wrapping, clipping and block sizes given the translation's length. List the locales you couldn't check.
7. **Measurements.** Confirm doubtful sizes through the DOM: element bounds and computed styles (padding, gap, min/max-width, flex, overflow). No way to measure → say the assessment is visual, not measured.

## Measuring tools

- [`../scripts/measure.mjs`](../scripts/measure.mjs) — one run for every page and width: measurements, window and close-up screenshots, console errors and failed requests. Needs Playwright from the project or installed globally; without it, use `measure-snippet.js` below. The console gets one line per page and width, details go to files:

  ```bash
  node <frontend-verify directory>/scripts/measure.mjs \
    --url ru=http://localhost:3000/settings --url en='http://localhost:3000/settings?lang=en' \
    --selectors ".form,.field,textarea" --shot-selector ".form" \
    --viewports 1440x900,768x900 --out /tmp/measure
  ```

  `--storage-state <file>` for pages behind a login; `--wait-for <selector>` to wait for the screen. `--help` lists every flag.
- [`../scripts/measure-snippet.js`](../scripts/measure-snippet.js) — the same inside an already open tab (a logged-in one too): paste its contents into the browser tool's evaluate and call `measureUi(['.selector', ...])`. Returns rectangles, computed styles, signs of clipping, overlap, horizontal scroll, and candidates for raw translation keys.

## Recording the result

For each deviation: window size, element, expected value and its source, actual (measured) value, conclusion. The list of checked widths, states and locales; what was left unchecked and why.
