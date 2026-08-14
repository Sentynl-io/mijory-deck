# MiJory Wellness Investor Deck

Static HTML investor presentation (and matching PDF) for MiJory Wellness.

## View locally

Open `index.html` in a browser, or:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Generate PDF

Creates `MiJory-Wellness-Investor-Deck.pdf` — one 1440×810 page per slide, matching the web layout:

```bash
npm install
npm run pdf
```

A GitHub Action also regenerates the PDF on pushes to `main` that change the deck.

## GitHub Pages setup

In the repo **Settings → Pages**:

1. **Source:** Deploy from a branch
2. **Branch:** `main`
3. **Folder:** `/ (root)`

After Pages is enabled, the site will be at:

`https://sentynl-io.github.io/mijory-deck/`

A separate 4-page investor brief (not the core deck) lives at:

- `https://sentynl-io.github.io/mijory-deck/brief/` — Trust infrastructure
- `https://sentynl-io.github.io/mijory-deck/brief/2.html` — Revenue events
- `https://sentynl-io.github.io/mijory-deck/brief/3.html` — Year 1 path
- `https://sentynl-io.github.io/mijory-deck/brief/4.html` — Mix shift

The main deck (`index.html`) links to `brief/index.html`.
