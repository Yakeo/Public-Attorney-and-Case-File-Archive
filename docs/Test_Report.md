# PACFAS test report

**Date:** 17 October 2026
**Decision:** **NOT READY — illustrated user manual deferred**
**Application baseline:** commit `5416e68` on `arena/f4cf2fd6-public-attorney-and-case-file`.

The request was to test the system and produce an illustrated Word manual **if everything works properly**. That condition was not met. No new user manual was generated, because several normal user workflows are broken and a working database is unavailable. The existing manual has not been certified by these tests.

## Results at a glance

| Check layer | Passed | Failed | What it establishes |
|---|---:|---:|---|
| Live HTTP smoke/readiness checks | 17 | 2 | Actual server starts, HTML is served, basic guards work; database-backed public endpoints are unavailable |
| Isolated route/controller and regression checks | 37 | 11 | Real routes/controllers with a mocked database; frontend handlers in a fake DOM; schema and installed-library compatibility checks |
| **Automated check total** | **54** | **13** | **67 checks; not a full end-to-end certification** |

Additional preparation: `npm ci --no-audit --no-fund` succeeded; every JavaScript file under controllers, routes, middleware, config, utils and frontend/js passed `node --check`; all declared runtime dependencies could be imported. Importing a package successfully does not prove the controller uses its API correctly.

The 11 isolated failures are deliberate regression gates: they assert the expected safe/working behavior and currently expose defects. They are not marked skipped or turned into passing tests that accept broken behavior. Two of those failures share the same client route-parameter root cause. Some other checks use source/schema inspection rather than real SQL execution, as specified below.

## Environment and limits

- Node.js: v22.22.3. Dependencies installed from the repository lockfile.
- Actual Express server tested on port 5000.
- Database connection check: `ECONNREFUSED`; neither configured local MySQL address accepted connections. No MySQL/MariaDB server executable was available in this workspace.
- Actual `/api/v1/attorneys` and `/api/v1/cases/public` requests returned HTTP 500 because database access failed. These are environment readiness failures, not evidence that these particular queries are wrong.
- No genuine records were created, changed or deleted. The live tests only send reads and empty-body validation requests.
- Isolated tests replace MySQL with a query responder, audit writes with a no-op, and image recognition with fixed synthetic text. They run actual Express routing, middleware, controller code, password hashing and JWT verification. A few upload tests create synthetic local files, which the tests remove.
- The fake database rejects undefined bind values like mysql2 does. It does **not** execute SQL, enforce foreign keys, emulate database locking or prove transactional isolation.
- Frontend checks execute the actual case-details script in a lightweight fake DOM. No real browser, layout, mobile, accessibility or screenshot validation was completed.
- Actual OCR recognition accuracy, language-model downloads, PDF rendering and server-restart recovery were not tested. Outbound network restrictions also prevent assuming OCR language assets are reachable.
- The test report and test suite are the deliverables for this failed validation gate. Application fixes were not silently bundled into the testing request.

## Confirmed failures and impact

### F01 — Critical: public registration accepts administrator role

**Source:** `controllers/authController.js`, `register`; `routes/authRoutes.js`.

**Reproduction:** submit registration with synthetic username/email/password and `role_id: 1`. The actual controller passes role 1 into its user INSERT; the public route has no administrator gate.

**Evidence type:** HTTP route/controller test with captured mock database parameters.

**Expected:** public registration cannot choose a privileged role. Ignore/reject the role field and assign a safe role server-side; privileged account creation requires an authorized path.

**Impact:** with a functioning database, an unauthenticated caller could provision an administrator account. Do not expose registration publicly until this is resolved.

### F02 — High: standard users can modify attorney assignments

**Source:** `routes/caseRoutes.js`, POST `/:id/attorneys`.

**Reproduction:** a valid role-5 token posts an attorney assignment. With valid synthetic case/attorney query results, the route returns 201 and inserts the association.

**Evidence type:** HTTP route/controller test; expected 403, received 201.

**Expected:** enforce the intended staff/admin role policy in the backend, as well as any required case-level access policy. Hiding the assignment form is not authorization.

### F03 — High: client-to-case linking and assigned-case lookup fail

**Source:** `routes/clientRoutes.js`; `controllers/clientController.js`, `linkClientToCase` and `listClientCases`.

**Reproduction:** POST `/api/v1/clients/1/cases` with `cf_code: 42`, or GET `/api/v1/clients/1/cases`.

**Evidence type:** two HTTP route/controller tests. Routes name the parameter `:id`, while controllers destructure `client_id`. The resulting undefined bind value causes 500 rather than the expected 201/200.

**Expected:** use the same parameter name in route and controller, validate it, and verify the association through a real database test.

### F04 — High: case hearing query selects a missing column

**Source:** `controllers/hearingController.js`, `getHearingsByCase`; `database.sql`, `hearing_schedule`.

**Reproduction:** inspect the query generated for GET `/api/v1/hearings?case_id=42`. It selects `h.title`, but the supplied schema has no `title` column in `hearing_schedule`.

**Evidence type:** captured generated SQL compared with the repository schema; not executed on a real database.

**Expected:** select the existing hearing_type field with the appropriate title alias, or migrate the schema and writers consistently.

**Impact:** with the provided schema, the hearing request cannot succeed. The case-details page includes this request in Promise.all, so it can also prevent the complete case view from rendering.

### F05 — High: calendar query uses an undefined SQL alias

**Source:** `controllers/hearingController.js`, `getHearingsByDateRange`.

**Reproduction:** inspect the query for GET `/api/v1/hearings/calendar?startDate=2026-11-01&endDate=2026-11-30`. It selects `hs.code` and `hs.label` without joining `hearing_status hs`.

**Evidence type:** captured generated SQL inspection; not real database execution.

**Expected:** add the required join and test both filtered and unfiltered date-range queries on MySQL/MariaDB.

### F06 — High: PDF MIME value exceeds the upload column width

**Source:** `controllers/documentController.js`, `uploadAndProcessDocument`; `database.sql`, `document.file_type`.

**Reproduction:** the controller inserts the full reported MIME type into `file_type`, but the schema defines `varchar(10)`. `application/pdf` requires 15 characters, `image/jpeg` 10 and `image/tiff` 10; PDF does not fit. (The regression test exercises a synthetic PNG upload and checks the PDF incompatibility against source/schema.)

**Evidence type:** schema/controller compatibility assertion, not a real PDF database insert.

**Expected:** store a short normalized type or expand the column through a controlled migration. Under strict SQL mode, an overlong value is rejected; under permissive settings, truncation is possible. Verify the deployment's SQL mode rather than assuming either outcome.

### F07 — High: download can return the original revision

**Source:** `controllers/documentController.js`, `uploadNewVersion` and `downloadDocument`.

**Reproduction:** revision uploads update current_version_no but do not update the parent file_path. The download query reads only the parent document.file_path.

**Evidence type:** captured download SQL and inspection of the revision update path; not a real persisted multi-version download.

**Expected:** resolve the current document_version path, or maintain a consistent current path. Check downloaded bytes after two real revisions.

### F08 — High: installed PDF parser does not match the controller call

**Source:** `controllers/documentController.js`, `processOCRInBackground`; locked `pdf-parse` dependency.

**Reproduction:** after npm ci, `typeof require('pdf-parse')` is `object`, with a PDFParse class export. The controller calls it as `pdfParse(dataBuffer)`.

**Evidence type:** actual installed-library compatibility check.

**Expected:** use the installed version's supported API and release any parser resources, or deliberately pin a compatible version after validation. In the current code, that call throws before the scanned-PDF fallback is reached. The outer catch only logs the failure.

### F09 — High: upload form sends no upload request

**Source:** `frontend/js/case-details.js`, uploadDocForm submit handler.

**Reproduction:** execute the actual handler and capture API calls. It hides the modal and refreshes data, but never POSTs to `/documents/upload` and never builds FormData.

**Evidence type:** actual JavaScript event logic executed in a fake DOM.

**Expected:** submit multipart FormData with field `document` and case_id, attach the bearer token, show errors, then refresh the list. Validate it in a real browser after the backend defects are fixed.

### F10 — High: download links omit required authentication

**Source:** `frontend/js/case-details.js`, `renderDocuments`; `routes/documentRoutes.js`.

**Reproduction:** generated document cards contain a direct anchor to `/api/v1/documents/:id/download`. Browser anchor navigation does not add the JWT stored in localStorage as an Authorization header. The live endpoint rejects missing bearer tokens with 401.

**Evidence type:** generated frontend markup check plus actual unauthenticated download-endpoint request.

**Expected:** fetch the file with the token and download the returned blob, or use another deliberately secured download mechanism. Do not weaken authentication just to make the anchor work.

## What passed — and what that does not mean

### Actual server checks (17)

- Process health response and uptime.
- HTML delivery for the landing, dashboard, case-details, clients, admin and public-cases pages.
- Missing-token rejection for profile, cases, clients, hearings, documents and downloads.
- Malformed-token rejection.
- JSON 404 for an unknown API route.
- Empty-field rejection on login and registration before database access.

HTML delivery is not proof that a page's data loads or its controls work. The health endpoint measures process liveness, not database readiness.

### Isolated checks (37)

- Expired/wrongly signed JWT rejection; selected role restrictions.
- Correct and incorrect password handling, token verification, registration password hashing and default role.
- Required case title, generated case number, missing case handling and parameterized filters.
- Attorney assignment validation and inactive-attorney rejection.
- Client field validation, creation against a supplied account, empty-update and missing-profile handling.
- Attorney directory response shaping; unknown profile handling; admin creation commit and rollback paths.
- Required hearing fields, staff conflict rejection, admin-only conflict override and missing calendar bounds.
- Upload role/missing-file/type validation; synthetic image upload commit; version-pointer advancement; missing history handling; search validation and bound parameters.

These validate control flow with controlled responses. They do not prove database-backed workflows pass end to end.

## Additional inspection risks — not counted as passing runtime tests

- `server.js` serves `/uploads` using express.static without authentication. This bypasses API download authentication for anyone who knows a file URL. Remove or protect that path before storing confidential case files.
- OCR has no persisted FAILED state, retry queue or durable worker. NULL text can remain labeled PROCESSING indefinitely; an empty string can be labeled COMPLETED despite no useful extraction.
- Hearing update does not repeat create-time conflict checking. Create-time check/insert is also not serialized against concurrent requests.
- Registration/login/token verification need review for inactive accounts and stale role claims.
- MIME filtering trusts the reported type; it does not validate file signatures. The 25 MB rejection path and content-spoofing defenses still need dedicated tests.
- Search covers all document versions and does not apply the ordinary list's deleted-document filter.
- Revision locking/concurrency, duplicate assignments, malformed dates, timezone boundaries, client account/profile consistency, audit persistence and recovery need real database tests.
- Case creation accepts a client_name from the UI but the controller does not persist that field as a linked client. The shaped client_name is the creating username, not necessarily the actual client.

## Repeat the checks

Use an isolated test checkout and synthetic data, not a live confidential archive.

```bash
npm ci --no-audit --no-fund
node --test tests/workflows.test.js
```

At this baseline the isolated suite exits nonzero because the 11 regression assertions expose existing defects. Image OCR and database operations are mocked. No configured database credentials are used by this suite.

For read-only live smoke checks, start the app in a separate terminal with the test environment configured:

```bash
PORT=5000 npm start
```

Then:

```bash
PACFAS_TEST_URL=http://127.0.0.1:5000 node --test tests/live-smoke.test.js
```

Without PACFAS_TEST_URL, live tests are explicitly skipped. This environment produced 17 passes and two public-database readiness failures. A healthy database can change those two results; it does not automatically fix the isolated regressions.

Machine-readable names and outcomes are saved in `docs/Test_Results.json`. Temporary TAP logs are not part of the deliverable.

## Gate for the illustrated Word manual

1. Fix the confirmed workflow/security defects and rerun these regression checks.
2. Start an isolated MySQL/MariaDB database, load database.sql, seed synthetic users for each role and verify actual SQL/constraints.
3. Run login/logout, directory search/profile, case creation/filter/detail, client creation/linking, attorney management/assignment, hearing create/update/conflict/calendar, and upload/version/download/search end to end.
4. Test real text PDFs, scanned PDFs, clear images, corrupt/unsupported/oversized files, failed OCR and repeated/concurrent uploads. Compare downloaded bytes with the chosen revision.
5. Verify authorization across roles and case ownership; ensure static file URLs cannot expose private uploads.
6. Run browser/mobile/error-state checks and capture screenshots only from those verified workflows using synthetic data.
7. Produce the Word manual with labeled screenshots, step-by-step role-specific instructions and honest OCR troubleshooting guidance.

**Bottom line:** enough failures were reproduced to withhold a “works properly” sign-off. A screenshot manual now would risk teaching users broken actions. The next task is to resolve these defects and provide a database-backed test environment, then complete the manual gate.
