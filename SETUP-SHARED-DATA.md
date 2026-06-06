# Make everyone see the same data (shared database)

By default the map saves contributions only in each visitor's own browser. To
make **bars, prices, ratings and beers shared live with everyone**, connect a
free **Supabase** database. It takes about 5 minutes and needs no credit card.

You only have to do **3 things**. Everything else is already built.

---

## Step 1 — Create a free Supabase project

1. Go to **https://supabase.com** and click **Start your project** (sign in with
   GitHub or email — it's free).
2. Click **New project**.
   - **Name:** anything, e.g. `tankove-pivo-map`
   - **Database password:** let it generate one (you won't need it for this).
   - **Region:** pick one close to your users (e.g. *Central EU (Frankfurt)*).
3. Click **Create new project** and wait ~1–2 minutes for it to finish setting up.

## Step 2 — Create the tables (one copy-paste)

1. In your project, open the **SQL Editor** (left sidebar, the `</>` icon).
2. Click **New query**.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql) from this project,
   copy **everything** in it, and paste it into the query box.
4. Click **Run** (or press ⌘/Ctrl + Enter). You should see *Success*.

That creates the tables and the rules that let the website read & write safely.

## Step 3 — Give the website your project's two values

1. In Supabase, open **Project Settings** (gear icon) → **API**.
2. Copy these two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string under *Project API keys* (the one
     labelled **`anon` `public`**, **not** `service_role`).
3. Paste them into [`config.js`](config.js) like this:

   ```js
   window.TANKMAP_CONFIG = {
     SUPABASE_URL: "https://abcdefgh.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi....the-long-anon-key...."
   };
   ```

4. Save, commit & push (or just **send me those two values and I'll do this part
   and test it for you**).

---

## That's it

Once `config.js` has the two values and is published, the site automatically
switches to shared mode:

- Everyone sees the same bars, prices, ratings and beers.
- The little hints on the forms change to "Shared live with everyone".
- If the values are ever wrong/removed, the site safely falls back to
  browser-only mode so it never breaks.

### Is the `anon` key safe to publish?

**Yes.** The anon key is *designed* to live in public website code. What it's
allowed to do is controlled by the database rules in `schema.sql`, which only
permit reading and adding rows — not editing or deleting other people's data.
Never publish the `service_role` key, though.

### Good to know

- **Free tier limits** are generous (plenty for a community map). You can upgrade
  later if it gets very popular.
- New contributions appear for other people **when they reload** the page (we can
  add instant live-updating later if you want).
- Spam protection: right now anyone can add a bar/price. If that becomes a
  problem, we can add light moderation. Just ask.
