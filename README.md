# Public Attorney and Case File Archive

Node.js/Express, MySQL/MariaDB, and a browser-based frontend. Requires Node.js 22+.

## Run locally

**Updating an existing installation? Back up your local `.env`, database, and
matching `uploads/` before pulling changes or replacing your project folder.**
The repository no longer distributes `.env` or `node_modules`.

1. Run `npm ci` in this directory. Installed dependencies are not shipped in Git.
2. Copy `.env.example` to `.env` and enter your local database settings. Existing
   local `.env` files are not overwritten by this cleanup.
3. Generate a secret with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   and set `JWT_SECRET` to that value. Never commit/share `.env`.
4. Restore your database backup into an empty database and copy its matching
   `uploads/` folder. The repository's `database.sql` is a fresh-install schema,
   **not** a backup of your records; do not import it over an existing archive.
5. Start MySQL, run `npm start`, and open the port configured in `.env`.

## Optional fictional defense dataset

The ZIP is at [`demo-data/PACFAS-Defense-Demo.zip`](demo-data/PACFAS-Defense-Demo.zip).
Extract it into this repository root. See [the setup guide](docs/Defense_Demo.md)
for the guarded one-time import. You do not need Python/document generators.

For normal startup after importing, set `DB_NAME=pacfas_defense_demo` and
`TESSDATA_PATH` to the absolute `demo-data/defense-v1/language-data` folder in
`.env`, then use `npm start`. Keep your matching uploads and language data.
The optional `scripts/demo/` tools and OCR recovery utility are retained.

## Checks

Run `npm test`. Real database tests are opt-in (`npm run test:integration` and
`npm run test:demo:integration` with the documented test environment settings).
The older full browser harness requires separately provisioned browser tooling/fixtures.
For the focused login/layout/navigation checks on Linux:

```sh
npm install --prefix .cache/ui-check --no-audit --no-fund playwright-core @sparticuz/chromium
npm run test:auth:browser
```

These use real Chromium with controlled auth API responses; they do not connect
to your database. Ordinary runtime and regression tests do not need this tooling.

Printed manuals, thesis documents, screenshots, documentation generators, and
the legacy bulk seeder were removed from the current tree. Previous copies
remain in Git history. Tests, migrations, and application source are retained.

## Printable user handbook

Download the [manual print pack](printable-manual/PACFAS_Print_Manual.zip) for
an A5 folded/stapled handbook printed on six duplex A4 sheets. The pack includes
a normal reading PDF, an already-arranged A4 booklet PDF, an editable Word copy,
and a one-sheet test/printing guide. Follow `printable-manual/PRINTING.txt`;
do not apply your printer's Booklet option to the already-arranged A4 file.

## Search inside scanned documents

After office login, use **Search documents** on the dashboard (whole archive)
or in a case (that case only). This is separate from the case title/description
filter. It searches current document titles, filenames and completed OCR text,
not a full-text preview. Results offer Open case and authenticated Download.
Typing is debounced by 250 ms; active searches refresh every 3 seconds while
the tab is visible. Scans become content-searchable only after OCR completes.
Clear returns to the case's document list. Up to 100 matches are returned;
narrow broad searches. Private document search is not exposed to public users.

No migration, reseeding or OCR-model replacement is required for this update.
Previously extracted text is reused. Attorney case creation is enabled (without
automatic counsel assignment); client/counsel management stays staff/admin only.
Case creation now confirms success with a notification.

### Real OCR/search browser validation (Linux, optional)

Install the browser tooling separately:

```sh
npm install --prefix .cache/search-browser --no-audit --no-fund playwright-core @sparticuz/chromium
```

Run `npm run test:search:browser` with `MYSQL_TEST_HOST` / `MYSQL_TEST_PORT` /
`MYSQL_TEST_USER` / `MYSQL_TEST_PASSWORD` (or `MYSQL_TEST_SOCKET`) and
`DEMO_BUNDLE` pointing to an extracted defense bundle. This explicitly creates
and drops unique disposable test databases; it never imports over DB_NAME.
It uses real SQL, browser uploads, English OCR and authenticated downloads,
including a scan becoming searchable without retyping the active query.
