# Real browser and scanned-document OCR validation

**Date:** 17 October 2026
**Outcome:** Documented primary workflows passed; illustrated Word manual created. This is a scoped workflow sign-off, not certification of all production scenarios.

## Final results

| Layer | Result | Scope |
| --- | --- | --- |
| Regression suite, `npm test` | 54 passed; no failures/skips | Route/controller tests, security checks, frontend event logic, real embedded-PDF parsing and OCR-state tests |
| Real database integration | 9 subtests + parent = 10 reported passes; no failures/skips | Migration, actual SQL, account access changes, client linking, hearing queries, versioning and concurrent revisions |
| Actual browser + actual OCR | 20 passed; no failures | Chromium UI interacting with the real API, MariaDB and Tesseract; no API/database/recognition stubs |
| Uncaught browser JavaScript errors | 0 | Final automated browser run |
| Word deliverable validation | Passed | DOCX ZIP integrity; 14 embedded screenshot figures; 3 reference tables |

Machine-readable browser outcomes: `docs/Browser_OCR_Results.json`. Actual screenshot assets: `docs/manual-images/`. Main deliverable: **`docs/User_Manual.docx`**; editable source: `docs/User_Manual.md`.

Browser checks are multi-action workflow checks, not 20 independent product features or a coverage percentage. Database test counts include Node's parent test. Do not simply add these counts and call them comprehensive test coverage.

## Environment and actual fixtures

- Chromium **153.0.8010.0**, headless, driven by Playwright Core **1.64.1**.
- Browser binary supplied by `@sparticuz/chromium` **153.0.0**, with its packaged Linux support libraries.
- Real **MariaDB 10.8.3**, private Unix socket, no TCP/public database port. A new disposable database was created for each run.
- Actual locked app dependencies and Node.js **22.22.3**.
- Actual Tesseract English LSTM recognition. Language data came from `tesseract-ocr/tessdata_fast`, `eng.traineddata`, SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.
- `TESSDATA_PATH` selected a local language directory because this workspace cannot access Tesseract's default language-data CDN. This configures real recognition; it does not replace it with a mock. Language caches are ignored rather than committed.
- Pillow/ReportLab generated clear PNG, JPEG, TIFF, a two-page image-only scanned PDF, an embedded-text PDF, a blank image and a corrupt PDF. Each contains only synthetic material.
- The scan is machine-printed, upright, high-contrast English. The run does not establish handwritten, multilingual, skewed, low-resolution or arbitrary legal-document accuracy.
- Desktop screenshots used 1440 × 1000; a dashboard smoke check used 390 × 844. External font requests were blocked to match the workspace network policy; system/font fallbacks were used. Local application/API requests were not intercepted or mocked.

All ordinary actions in the browser suite were executed through the rendered interface. The extracted-text search check called the application's real API from the logged-in browser because there is no document-text search box in the current case view. A direct public-endpoint check verified that the new private case was not published. These API checks are not described as UI controls in the manual.

## Defects found and repaired during this stage

1. **Scanned PDF renderer/worker mismatch.** Direct image recognition worked, but PDF fallback threw “API version 6.2.108 does not match Worker version 5.4.296.” The text parser and separate PDF renderer loaded incompatible pdf.js workers. Fallback now uses `PDFParse.getScreenshot()` from the same parser instance as `getText()`, and destroys it afterward. Both scanned pages then produced their expected markers, ALPHA 7426 and BETA 7427.
2. **No visible login trigger on the landing page.** The login modal and handler existed but no element had `openLoginBtn`. Added Staff Login and a logged-in Logout button, then verified wrong-password feedback and successful navigation.
3. **Unwired Add Hearing control.** Added a real date/title/venue/notes form, save request, errors and explicit admin-only override control. The case view now shows hearing titles. Browser checks demonstrated a 409 conflict, a deliberate administrator override and staff rejection.
4. **Client identity displayed incorrectly.** Case shaping used the creating username as client_name, while creation silently ignored the free-text client input. Removed that input, explicitly instructing users to link clients afterward, and derive displayed client names from client_case/client records. Verified client creation, link and dashboard/detail display through the browser and real SQL.
5. **Misleading dashboard text.** Pending Hearings actually counted pending cases; renamed it Pending Cases. The creation-number preview now uses the database's category codes, search describes the supported title/description fields, and Registered Date describes the shown registration date.
6. **Mobile horizontal overflow.** The real 390-pixel check failed. Added wrapping navigation/toolbars, an internally scrollable case table, bounded controls/dialogs and proper hidden-drawer handling. The dashboard then fit the viewport without widening the page.
7. **Shared default initial attorney password.** Removed the controller's password123 fallback. Admin creation now requires at least 12 characters and a masked password input. Added regression coverage and verified account creation with a non-default synthetic password.
8. **Public-by-default case creation.** New cases explicitly save is_visible=0, the fresh schema defaults to private, and internal listing no longer requires public visibility. Added migration 002 and checked both internal access and absence from the unauthenticated public-summary endpoint. Existing public records are not automatically altered; administrators must review them separately.

An early browser-harness expectation also incorrectly waited for the literal greeting “Welcome”; the app shows the account name. That test assertion was corrected. One screenshot attempt timed out with the unsupported multiprocess serverless-browser combination; the final run used the packaged serverless process flags, normal same-origin security, longer screenshot timeout and disabled screenshot animations. Those harness issues were not misreported as application defects. Earlier failed runs were not used for the final sign-off or screenshots.

## Final browser workflows

The 20 named checks in the JSON cover:

- Public directory search, profile and empty public-summary page.
- Wrong and correct login; logout removes saved credentials.
- New private case through the drawer; preview and saved record.
- Client creation, counsel creation, counsel assignment and client linking.
- Hearing creation, conflict feedback, administrator override and staff restriction.
- PNG upload with actual recognized text displayed in the card.
- Two-page scanned-PDF revision with both markers recognized.
- Downloaded current-revision bytes matched the uploaded PDF using SHA-256.
- JPEG and TIFF recognition; embedded-text PDF extraction.
- Blank-image failure, an accepted real retry, and safe repeated failure.
- Corrupt-PDF failure while retaining the saved document.
- Unsupported-file validation shown to the user.
- Stored-text search returning recognized revisions.
- Dashboard search/status filters, linked-client display and mobile width.
- Private archive denial for public-role credentials.
- New internal case excluded from public summaries.
- No uncaught JavaScript errors.

Expected negative-case logs (invalid credentials, 409 conflicts, FAILED blank/corrupt recognition, rejected type, 403 public access) are part of passing failure-handling tests. They are not counted as successful recognition or as unexpected application failures.

## Repeat in a Linux test workspace

Use only a dedicated test database server/account with CREATE/DROP DATABASE permission. The browser harness creates a uniquely named `pacfas_browser_*` database and removes it and its uploaded fixtures in cleanup. It does not load schema into the normal app database or modify `.env`.

1. Install app dependencies using the lockfile: `npm ci`.
2. Install isolated browser tools without adding them to production dependencies:

```bash
npm install --prefix .cache/browser --no-audit --no-fund playwright-core@1.64.1 @sparticuz/chromium@153.0.0
python -m venv .venv
.venv/bin/pip install -r scripts/manual-requirements.txt
.venv/bin/python scripts/make_ocr_fixtures.py
```

The fixture script uses the standard Linux DejaVu Sans font path. Install/provide that font if using a different environment. The browser harness currently targets this Linux serverless Chromium setup; other OS/browser combinations need appropriate setup rather than a promise of portability.

3. Provision English language data through an approved channel. In this workspace, the connected GitHub CLI retrieved the actual model:

```bash
mkdir -p .cache/ocr
gh api repos/tesseract-ocr/tessdata_fast/contents/eng.traineddata \
  -H 'Accept: application/vnd.github.raw+json' > .cache/ocr/eng.traineddata
```

Verify the source/hash. A future upstream model change can alter the checksum and recognition output. Do not commit model binaries or test databases.

4. Start a private test MariaDB/MySQL server. Then run, with the appropriate socket and local test credentials configured in the environment:

```bash
PACFAS_BROWSER_TEST=1 \
MYSQL_TEST_SOCKET=/path/to/private/mysql.sock \
MYSQL_TEST_USER=YOUR_TEST_USER \
TESSDATA_PATH="$PWD/.cache/ocr" \
npm run test:browser
```

Alternatively use MYSQL_TEST_HOST/MYSQL_TEST_PORT for a test TCP server. Set MYSQL_TEST_PASSWORD in a local secret environment if required; do not paste production credentials into chat or commit them. The harness points the app at its disposable database and uses the real app pool/OCR scheduler, unlike the isolated unit tests.

5. Run the regression and database integration suites, then rebuild the manual:

```bash
npm test
# Set PACFAS_MYSQL_TEST=1 and test database connection variables for this command:
npm run test:integration
.venv/bin/python scripts/build_user_manual.py
```

Without the integration opt-in, its suite is skipped; that is not a pass against SQL. Browser testing requires its explicit opt-in and fixtures. Screenshots and results are overwritten by a new run; review success before rebuilding/publishing the manual.

## Existing installation changes

- Back up first and follow `docs/Repair_Validation.md` for migration 001 if not already applied.
- Apply **`migrations/002_private_case_defaults.sql`** to existing databases. It changes the default only, not existing publication decisions. The API also inserts private visibility explicitly.
- Review all existing is_visible=1 cases for authorized publication. There is no publishing toggle in this browser interface.
- The app supports optional **DB_SOCKET** for Unix-socket connections; existing host/port settings are unchanged.
- Optional **TESSDATA_PATH** enables provisioned local English data. Its directory is also used for the language cache.
- Initial attorney passwords must now contain at least 12 characters. No shared default is issued.
- Test databases, browser binaries and language data stayed under ignored paths. No real archive records or configured database credentials were changed.

## Limits and operational caution

The manual is accurate for the tested primary workflows, not a declaration that the product is ready for every legal-office deployment. Still outside this sign-off:

- Handwriting, arbitrary languages, poor scans, encrypted PDFs and mixed text/image completeness.
- Fully durable OCR queues, load/resource limits, crash recovery automation, malware scanning and large-scale recognition concurrency.
- Hearing editing/rescheduling/cancellation UI, update-time conflict prevention and serialized concurrent hearing creation.
- Per-client/per-case portal isolation: office roles currently share the private archive.
- Complete account-management/password-reset UI, duplicate profile/assignment guarantees and public publishing UI.
- Broad phone/tablet/Firefox/Safari coverage, full keyboard/screen-reader accessibility, audit durability and disaster recovery.
- Production server version/configuration verification beyond the temporary MariaDB 10.8.3 setup.

Review the established offline OCR recovery procedure before using it. The test sign-off does not change those constraints. The user manual deliberately avoids inventing controls for backend-only or unfinished features.
