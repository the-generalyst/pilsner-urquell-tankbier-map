# 🛢️ Berlin Tankbier Map

An interactive map of every bar in Berlin where you can drink **Pilsner Urquell straight from the tank** — unpasteurised "tankové pivo", served the way they pour it in Plzeň.

🔗 **Live site:** https://the-generalyst.github.io/pilsner-urquell-tankbier-map/

## What's on the site

- **Interactive map** (scroll, zoom, click a 🛢️ marker) powered by Leaflet + OpenStreetMap — completely free, no API keys.
- **Explainer** of what tank beer is and why it tastes better than beer from a standard keg/barrel.
- **Crowd-sourced prices** — anyone can log what they paid at each bar. The site shows the average and cheapest price per 0.5 L.
- **Star ratings (1–5)** — visitors rate the quality of the pour; the site shows each bar's average rating. You can leave a rating, a price, or both.
- **Add your own bars, in any city** — found a tank-beer spot that's missing? Click **"＋ Add a tank bar"**, type the name and address, and it's geocoded automatically and dropped on the map. A **city filter** lets you browse by city as the list grows beyond Berlin.

## How contributions work (important)

Prices, ratings and bars you add are stored locally in each visitor's browser using `localStorage`. This keeps the site **free to host and requires no server or login**. The trade-off: what you add is visible on *your* device, not (yet) shared globally between all visitors.

If you later want everything shared across everyone, the easiest upgrade is a free hosted database such as **Supabase** or **Firebase** — the code in `app.js` is structured so the storage functions (`loadPrices` / `addReview` / `saveUserBar`) can be swapped for an online database. Just ask and this can be wired up.

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
  "address": "Street 1, 12345 Berlin",
  "neighborhood": "Kreuzberg",
  "lat": 52.5,
  "lng": 13.4,
  "type": "Biergarten",
  "note": "A sentence about the place.",
  "website": "https://example.com"
}
```

To find coordinates for a new bar, search the address on <https://www.openstreetmap.org>, right-click the spot → "Show address", and copy the lat/lng.

## Tech

- [Leaflet](https://leafletjs.com/) for the map
- [OpenStreetMap](https://www.openstreetmap.org/) tiles
- Vanilla HTML / CSS / JavaScript — no framework, no build tools

---

*Independent fan project. Not affiliated with Pilsner Urquell or Asahi. Bar list is community-maintained — always check with the bar before heading out.*
