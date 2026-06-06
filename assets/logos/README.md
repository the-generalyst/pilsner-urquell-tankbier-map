# Brand logos

Drop brewery logo image files in **this folder** and they'll appear automatically
on the map markers, the legend, and the sidebar — no code changes needed.

## File names

Name each file exactly after the brand's `id` in [`../../data/brands.json`](../../data/brands.json),
with a `.png` extension:

| Brand | File name to use |
|---|---|
| Pilsner Urquell | `pilsner-urquell.png` |
| Gambrinus | `gambrinus.png` |
| Velkopopovický Kozel | `kozel.png` |
| Staropramen | `staropramen.png` |
| Budweiser Budvar | `budvar.png` |
| Ursus | `ursus.png` |
| Krušovice | `krusovice.png` |
| Bernard | `bernard.png` |
| Kozel Dark | `kozel-tmavy.png` |

## Tips for good-looking markers

- **Square-ish images** work best (they're shown in a small round badge).
- **Transparent PNG** (or a simple logo on a plain background) looks cleanest.
- Roughly **128×128 px** is plenty; small files load faster.
- If a file is missing, the map automatically shows the brand's coloured letter
  badge instead — so nothing breaks while you collect the images.

## ⚠️ Important: logos are trademarks

Brewery logos are trademarked/copyrighted. Use them responsibly:
- Prefer official **brand / press / media asset** pages, which usually state the
  terms of use, or
- Ask the brewery for permission, especially if this site ever becomes commercial.

Displaying a logo purely to identify which beer a bar serves (a community,
non-commercial map) is generally lower-risk, but the responsibility is yours.

Want SVG instead of PNG? Tell me and I'll switch the file extension the code
looks for.
