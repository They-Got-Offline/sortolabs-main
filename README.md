# WH40K 11e Companion

Single-file   40,000 11th edition datasheets, army builder and reference app.

Live: https://piperpb.github.io/wh40k-11e-companion/

## Auto-update

A GitHub Actions workflow (`.github/workflows/update.yml`) runs daily. It clones
[BSData/wh40k-11e](https://github.com/BSData/wh40k-11e), converts the BattleScribe
catalogues into the app's embedded data (`tools/convert.py`), rebuilds `index.html`
from `src/template.html` (`tools/build.py`) and commits only if something changed.
GitHub Pages then serves the new version, plus `data.json` on its own.

Copies hosted elsewhere (e.g. wh40k.pplx.app) contain a small boot loader: on open they
check `data-version.txt` on GitHub Pages and, if newer, load `data.json` before starting
the app, so they stay current without being re-published. If GitHub is unreachable they
use the data built into the file. The BSData commit used is recorded in
`data-version.txt` and in the app header tooltip.

Run it manually from the Actions tab ("Update from BSData" → Run workflow), or locally:

```sh
git clone --depth 1 https://github.com/BSData/wh40k-11e.git bsdata
python3 tools/build.py bsdata
```

## What updates automatically

- Units: stats, weapons, abilities, keywords, points (incl. size tiers and points modifiers), wargear options
- Army rules, detachments (DP, rules) and enhancements (points, text, detachment links)

## What stays static

- Stratagems, missions and deployments (`reference-data` block in `src/template.html`, imported from the 11e PDF)
- Hand-verified enhancement eligibility for Thousand Sons (`ENH_MAP` in the template)

Data © Games Workshop; datasheet data from the BSData community project. Unofficial fan tool.
