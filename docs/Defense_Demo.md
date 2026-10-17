# Small fictional defense dataset

This package is for an **isolated software demonstration**, not a real legal archive. Every person, event, bar reference, and record is fictional. Each document is visibly marked **SYNTHETIC DEMO DATA — NOT A REAL LEGAL RECORD**. Email addresses use the reserved `example.test` domain.

## What you get

| Item | Quantity |
|---|---:|
| Attorneys | 5, with 3–4 primary cases each |
| Clients | 18 fictional profiles, with disabled backing accounts |
| Cases | 18, across 10 case categories |
| Distinct documents | 90: exactly 5 per case |
| Document-version files | 92: the 90 originals plus 2 revisions |
| Scheduled hearings | 8 |
| Public/private cases | 2 explicitly synthetic public summaries / 16 private |

Each case contains an intake summary, supporting statement, evidence inventory, hearing preparation notes, and progress report. Files are real, readable PDFs/images—not empty attachments or links to nonexistent files. The 92 files comprise **91 PDFs and 1 PNG**; one PDF is image-only and requires OCR. The package also includes an English OCR model and its Apache 2.0 license.

## Install on your defense device

Use the latest repository **and** `PACFAS-Defense-Demo.zip`. The repository contains the generator/importer and the downloadable ZIP at `demo-data/PACFAS-Defense-Demo.zip`. You can download that file from GitHub, or find it inside a clone/download of this repository. Extract the inner demo ZIP into the repository root before seeding.

1. Install **Node.js 22 or newer** and start your local MySQL/MariaDB installation, such as XAMPP's database service. Your database user needs permission to create a separate database and its tables.
2. Extract the ZIP **into the repository root**. Check that `demo-data/defense-v1/manifest.json` exists; avoid an extra nested folder.
3. In a terminal in the repository root, run:

   ```sh
   npm ci
   ```

4. Configure your local `.env` connection settings: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and a strong `JWT_SECRET`. Keep your existing `DB_NAME` unchanged. Remove a stale `DB_SOCKET` value when moving from Linux to Windows or another MySQL installation. Do not copy another device's `node_modules`.

   To generate a local JWT secret:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Install the demo:

   ```sh
   npm run demo:seed -- --database pacfas_defense_demo --confirm-demo
   npm run demo:verify -- --database pacfas_defense_demo --confirm-demo
   ```

   **Do not import `database.sql` first.** The importer initializes a new database itself. An existing database must have **no tables**, or be a matching completed installation made by this importer. It refuses an unmarked existing archive, even if its name ends in `_demo`.

6. Start the isolated demo:

   ```sh
   npm run demo:start -- --database pacfas_defense_demo --confirm-demo
   ```

   This selects the demo database and included offline English model **without editing your `.env`**. Open the app at `http://localhost:5000` on that device, or your configured `PORT`. Do not open the HTML using `file://`. Stop with **Ctrl+C**. Your ordinary `npm start` still uses your original `.env` settings.

For fully offline use, complete `npm ci` and install/start your local database before disconnecting. The included model removes the OCR model download requirement; external web fonts may use the browser's fallback fonts.

**Keep this demo off public/live deployments:** its shared passwords are intentionally public. It does not replace the existing application's production security or backup configuration.

## Demo logins

All eight sample logins use this **demo-only password**: `Defense-Demo-7426!`

| Email | Role |
|---|---|
| `demo.admin@example.test` | Administrator |
| `demo.staff@example.test` | Staff; recommended for hearing conflict demonstration |
| `tala.demo@example.test` | Attorney: Tala Demo, `D0001` |
| `mateo.demo@example.test` | Attorney: Mateo Demo, `D0002` |
| `iris.demo@example.test` | Attorney: Iris Demo, `D0003` |
| `nico.demo@example.test` | Attorney: Nico Demo, `D0004` |
| `lila.demo@example.test` | Attorney: Lila Demo, `D0005` |
| `demo.public@example.test` | Standard/public role, not authorized for the private archive |

Use **Staff Login** on the landing page for staff/admin/attorney walkthroughs. The 18 client profiles have **inactive**, random-password backing accounts; this is not a claim that a functioning client portal exists. Counsel can view the office archive and create private cases; client management and counsel assignment remain staff/admin actions. Creating a case does not automatically assign its creator as counsel.

## Suggested 8–10 minute demonstration

1. **Public directory:** show five fictional attorneys, search for Tala, and open a profile. The public case list contains only `DEMO-17` and `DEMO-18`; the other 16 are private.
2. **Dashboard:** sign in as admin; show 18 cases, varied categories/statuses/priorities, and five documents per case. Search by the title prefix, such as `DEMO-01`; these are training labels, separate from the app's generated case numbers.
3. **OCR:** open `DEMO-01 - Riverside Boundary Review`. Document 1 is an image-only scanned PDF; document 2 is a PNG. Type **ORCHID** into **Search documents** in the workspace or case view. Matching current documents appear as you type; use Open case or Download document to retrieve them. The full extracted text is no longer displayed on cards. The initial extracted text was produced by the real parser/recognizer, not copied from the authoring template.
4. **Live upload:** upload a copy from `demo-data/defense-v1/files/` through the document modal. Keep an ORCHID document search active while uploading a new scan containing that word. Observe pending/processing/completed states; the new document joins the results after OCR finishes, without retyping. This creates an **additional** document unless you choose **Upload revision** on an existing card.
5. **Revisions:** open `DEMO-02` or `DEMO-03`. The intake document already has revisions 1 and 2; its current card/download uses revision 2, containing **REVISIONTWO**. Revision 1 contains **INITIALCOPY**. The current UI does **not** include a historical-version picker: inspect the real versions endpoint for history or use **Upload revision** to demonstrate another version.
6. **Relationships:** `DEMO-03 - Meadow Family Support` has **Iris Demo + Mateo Demo**, and **Dalisay Sample03 + Amihan Sample01**. Amihan is also linked to `DEMO-01`. Show the counsel/client sections and linked case list.
7. **Hearing conflict:** sign in as staff. `DEMO-01` already has a hearing **14 days after the package reference date at 09:00**. Attempt a hearing for `DEMO-06` on that date at **09:30**. Both cases share Tala Demo, so the existing endpoint rejects the attempt with **409**, rather than inserting an invalid schedule. For the supplied package dated **2026-10-17**, use **2026-10-31**. If your browser/server time zones differ, use consistent zones before rehearsing; on a Philippine device `TZ=Asia/Manila` in the server environment aligns with local browser time.
8. **Role boundaries:** the public-role account cannot fetch private cases/documents; attorney accounts can create cases but cannot change counsel assignments or manage clients. Do not promise assignment-only viewing: the app currently allows authorized office roles to view the office archive.

### Optional API checks from the signed-in browser

Use **Search documents** for live title, filename and OCR-content retrieval. Queries are debounced by 250 ms and active visible searches refresh every 3 seconds. Only current versions are searched, with up to 100 matches; narrow the query if it reaches the limit. A historical-version picker is still not provided. These **read-only** examples can be run in the browser console on a page that loads the shared `api.js` helper:

```js
console.table((await apiRequest('/documents/search?q=ORCHID')).data);
console.table((await apiRequest('/documents/search?q=REVISIONTWO')).data);
// Use a real document ID returned by the API, not the DEMO title prefix:
const matches = (await apiRequest('/documents/search?q=REVISIONTWO')).data;
console.table((await apiRequest(`/documents/${matches[0].document_id}/versions`)).data);
```

The seeded baseline returns **5 ORCHID matches** and **2 REVISIONTWO matches**. Extra uploads/revisions can increase these numbers. Only run console code you understand; never paste or share an authentication token.

## Repeatability and safety

- The CLI requires both an explicit database name ending in `_demo` and `--confirm-demo`. It **never chooses `DB_NAME` automatically** for seeding.
- It initializes schema only when the target has zero tables. The three default directory accounts from the ordinary SQL dump are excluded so the demo has exactly five attorneys.
- Inserts use a transaction and a generator-owned receipt containing a manifest SHA-256 fingerprint and inserted IDs. An advisory database lock prevents two installers targeting the same DB concurrently.
- An identical rerun verifies and skips existing records; it does not duplicate them or reset your rehearsal changes. There is **no wipe/reset command**. Use another fresh `*_demo` database for a new rehearsal.
- Files live at portable, relative paths under `uploads/defense-v1/<database>/`. Different demo DBs do not share that upload directory. Real uploads are not moved or deleted.
- `demo:verify` checks the original baseline, its version records, hashes, and core relationships. Changing/deleting baseline records may make verification fail; it never repairs this by overwriting your edits. Additional uploads are not removed.
- On a failed or interrupted installation, existing data/files are preserved. If the importer reports an existing destination or incomplete installation, inspect it before making changes; simplest is to use another empty demo DB. A database commit/network failure can be ambiguous, so the importer deliberately retains possibly committed files rather than deleting them.
- The ZIP contains no `.env`, Node modules, real credentials, or database server binaries. It is **not** a dump of your existing database.

## Rebuild from source (optional)

You do not need to rebuild if you downloaded the ZIP. To create the same-sized dataset with hearing dates relative to a new rehearsal date:

```sh
npm run demo:build -- --date 2026-10-17
```

The builder downloads the genuine English model from `tesseract-ocr/tessdata_fast`, validates SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`, extracts each text PDF with `pdf-parse`, and recognizes the scan/image with Tesseract. It refuses to label empty/failed extraction as completed.

For offline building or a system with a certificate/proxy issue:

```sh
npm run demo:build -- --date 2026-10-17 --language-data /path/to/eng.traineddata
```

Use the validated model from the downloaded package. **Never disable TLS certificate verification.** Existing bundle/ZIP outputs are not overwritten. For another build use a **new parent directory**, for example:

```sh
npm run demo:build -- --out demo-data/rehearsal-two/defense-v1 --date 2026-11-01 --language-data demo-data/defense-v1/language-data/eng.traineddata
npm run demo:seed -- --bundle demo-data/rehearsal-two/defense-v1 --database rehearsal_two_demo --confirm-demo
npm run demo:start -- --bundle demo-data/rehearsal-two/defense-v1 --database rehearsal_two_demo --confirm-demo
```

The old bulk seeder has been removed; use the guarded demo commands above for sample-data setup.

## Tests

```sh
npm test
npm run test:demo
# Explicit opt-in; creates/drops ONLY new disposable test databases:
PACFAS_DEMO_TEST=1 MYSQL_TEST_SOCKET=/path/to/mysql.sock npm run test:demo:integration
```

Alternatively use `MYSQL_TEST_HOST`, `MYSQL_TEST_PORT`, `MYSQL_TEST_USER`, and `MYSQL_TEST_PASSWORD` instead of a socket. Environment-variable assignment syntax above is for Unix shells; in PowerShell set `$env:NAME='value'` first. Integration tests independently verify all 90 current downloads by SHA-256 and re-run the application's real extractor against the image-only PDF and PNG.
