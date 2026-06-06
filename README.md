# 🛢️ Tankové Pivo Map

A community map of bars **across Europe** that serve beer **straight from the tank** — unpasteurised "tankové pivo" from Pilsner Urquell, Gambrinus, Kozel, Staropramen, Budvar, Ursus and more.

🔗 **Live site:** https://the-generalyst.github.io/pilsner-urquell-tankbier-map/

## What's on the site

- **Interactive map** (scroll, zoom, click a marker) powered by Leaflet + OpenStreetMap — completely free, no API keys.
- **Brand-coded markers** — each pin is colour-coded by the beer it pours, with a legend under the map. Brands live in [`data/brands.json`](data/brands.json).
- **Which beers are on tank** — every bar lists the tank beers it serves, and anyone can report or update them ("＋ Update beers served").
- **Explainer** of what tank beer is and why it tastes better than beer from a standard keg/barrel.
- **Crowd-sourced prices** — anyone can log what they paid. The site shows the average and cheapest price per 0.5 L.
- **Star ratings (1–5)** — visitors rate the quality of the pour; the site shows each bar's average. Leave a rating, a price, or both.
- **Add your own bars, anywhere in Europe** — click **"＋ Add a tank bar"**, type the name/address and pick which beers it serves; it's geocoded automatically and dropped on the map. A **city filter** lets you browse by city.

## How contributions work (important)

Beers, prices, ratings and bars you add are stored locally in each visitor's browser using `localStorage`. This keeps the site **free to host and requires no server or login**. The trade-off: what you add is visible on *your* device, not (yet) shared globally between all visitors.

If you later want everything shared across everyone, the easiest upgrade is a free hosted database such as **Supabase** or **Firebase** — the code in `app.js` is structured so the storage functions (`loadPrices` / `addReview` / `saveUserBar` / `saveCommunityBeers`) can be swapped for an online database. Just ask and this can be wired up.

### A note on brand logos

Markers use clean, **brand-coloured badges** (e.g. a green "PU" for Pilsner Urquell), not the breweries' official logo files — hotlinking copyrighted logos is legally and technically fragile. To use real logos, add the image files and swap the badge in `brandIcon()` in `app.js`.

Address lookup for new bars uses the free [OpenStreetMap Nominatim](https://nominatim.org/) service directly from the browser — no API key needed.

## Run it on your own computer

It's a plain static website — no build step. The simplest way:

```bash
# from inside the project folder
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

> Opening `index.html` directly by double-clicking will **not** load the bar data (browsers block local file fetches). Use the command above, or just visit the live GitHub Pages URL.

## Publish it for free with GitHub Pages

1. Push this repo to GitHub (already done if you used the setup script).
2. On GitHub, open the repo → **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select branch **`main`** and folder **`/ (root)`**, then **Save**.
5. Wait ~1 minute. Your site will be live at:
   `https://<your-username>.github.io/pilsner-urquell-tankbier-map/`

## Adding or editing bars

All bar data lives in [`data/bars.json`](data/bars.json). Each entry looks like:

```json
{
  "id": "unique-slug",
  "name": "Bar name",
  "address": "Street 1, 12345 City",
  "city": "Prague",
  "country": "Czechia",
  "neighborhood": "Old Town",
  "lat": 50.08,
  "lng": 14.42,
  "type": "Pub",
  "beers": ["pilsner-urquell", "kozel"],
  "note": "A sentence about the place.",
  "website": "https://example.com"
}
```

`beers` is a list of brand IDs from [`data/brands.json`](data/brands.json). To find coordinates for a new bar, search the address on <https://www.openstreetmap.org>, right-click the spot → "Show address", and copy the lat/lng.

## Tech

- [Leaflet](https://leafletjs.com/) for the map
- [OpenStreetMap](https://www.openstreetmap.org/) tiles
- Vanilla HTML / CSS / JavaScript — no framework, no build tools

---

*Independent project. Not affiliated with any brewery. Brand names and colours belong to their respective owners and are used only to identify which beer a bar serves. Bar data is community-maintained — always check with the bar before heading out.*
