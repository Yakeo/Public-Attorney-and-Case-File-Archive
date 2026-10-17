# Security, document workflow and OCR repair notes

Date: 17 October 2026. Updated after successful temporary-database integration testing. Applies to this branch's repaired implementation; the earlier System Explainer describes the pre-repair code and is not an updated operational manual.

**Latest status:** Real-browser and real scanned-document OCR validation has now passed. See `docs/Browser_OCR_Validation.md` for the final scope, additional repairs and rerun instructions. The illustrated `docs/User_Manual.docx` is now available with 14 actual screenshots. The stage-by-stage notes below predate that final pass.

## Implemented

- Public registration ignores client-supplied role IDs and always assigns role 5.
- Authentication now checks the account's current role and active status in MySQL on every protected request. Inactive accounts cannot log in, and stale JWT role claims cannot preserve administrator privileges after demotion.
- Private case, document and hearing APIs require office roles 1/2/3. Attorney assignment changes require administrator/staff roles 1/3. Public/client roles 4/5 do not have private archive access. This is an office-wide role policy, not a new per-case/client portal permission model.
- Raw `/uploads` URLs return 404. Downloads go through the authenticated API.
- Client-case routes now pass the correct client ID. Hearing detail queries use hearing_type as title, and calendar queries join hearing_status.
- Upload requests now use multipart FormData with the bearer token and a browser-generated multipart boundary. Files have UUID names and MIME-derived extensions. Server-side signatures are checked as well as reported MIME type; this is not malware scanning.
- Uploaded metadata and revisions are transactional. Rollback removes uncommitted files; global error cleanup does not delete already committed uploads.
- Revision uploads lock the document parent before choosing the next version, and a unique document/version key provides an additional integrity constraint.
- Downloads join the current revision and preserve the file extension. The browser fetches with authentication, downloads a blob and releases its URL.
- PDF extraction uses the installed PDFParse class, getText and destroy APIs. A real synthetic text PDF passed extraction with the installed library.
- Each version stores PENDING, PROCESSING, COMPLETED or FAILED plus a safe failure message. Empty extraction is a failure, not success. Jobs update only their own document/version. Conditional claims prevent duplicate processing of the same pending version.
- Failed versions can be retried through POST `/api/v1/documents/:document_id/versions/:version_no/retry`. Only FAILED versions can transition back to PENDING.
- Case document cards show status and version, support retry and revision upload, and poll pending jobs for approximately two minutes. Refresh status restarts checking; page navigation stops the pending timer.
- Search excludes deleted documents and versions without completed extraction. It remains parameterized SQL substring search across completed revisions, not semantic search.
- `/health` checks process liveness; `/ready` returns 503 if MySQL is unavailable.

## Deployment: existing installations

Do not import database.sql over a live archive: it contains DROP TABLE statements. Stop the application and all other instances, back up the database and document directory, then apply the additive migration once.

1. Check for duplicate document/version pairs and resolve them deliberately:

```sql
SELECT document_code, version_no, COUNT(*)
FROM document_version
GROUP BY document_code, version_no HAVING COUNT(*) > 1;
```

2. Apply `migrations/001_document_ocr.sql` using your existing database administration connection. For example, on a machine with the MySQL client:

```bash
mysql -u YOUR_DB_USER -p YOUR_DB_NAME < migrations/001_document_ocr.sql
```

The migration widens document.file_type, adds OCR status/error columns, adds revision uniqueness, preserves existing text and marks old empty/unfinished extraction as FAILED so staff can retry. Run it once, not at every startup. MySQL DDL commits implicitly; restore from the backup if migration recovery is needed rather than assuming a transaction rolls back schema changes.

3. Install locked dependencies using Node.js 22 or another version supported by all dependencies:

```bash
npm ci
npm test
```

4. Review existing privileged accounts for unauthorized registrations, deactivate suspicious accounts and rotate the JWT signing secret through deployment configuration if compromise is possible. This code repair does not retroactively remove malicious accounts.
5. Restart and verify `/ready`, then test uploads and downloads with synthetic documents before allowing real case files.

For a brand-new empty database, use the updated database.sql instead of the migration. Optional seed documents explicitly mark their already-supplied text as COMPLETED.

## Interrupted OCR maintenance

OCR still runs in the application process, not a durable job queue. A shutdown can interrupt a pending/running job. After stopping **all** application/worker instances, run:

```bash
npm run ocr:recover -- --confirm-workers-stopped
```

This marks PENDING/PROCESSING jobs FAILED while retaining their files and existing text. Restart the application; staff can then use Retry extraction. Do not run recovery alongside active jobs: it is an offline maintenance command, not an automated timeout detector.

## Validation performed

- `npm ci --no-audit --no-fund`: succeeded.
- JavaScript syntax checks over controllers, routes, middleware, config, utilities, frontend scripts, tests and scripts: passed.
- `npm test`: **54 passed, 0 failed, 0 skipped**.
- Tests exercise real Express routing/middleware/controllers with a fake database, actual bcrypt/JWT behavior, upload validation/size cleanup, rollback and commit handling, current revision download bytes, conditional retries, frontend event logic in a fake DOM, and shared authenticated multipart/download helpers.
- OCR tests exercise persisted state transitions with fake recognition and fake database writes, worker cleanup, empty/failed recognition, corrupt PDFs and conditional claiming. The text-PDF test uses a genuine generated PDF and the real installed PDF parser; it does not mock parser output.
- Actual non-mocked server smoke checks: `/health` 200, `/ready` 503, raw `/uploads` 404, unauthenticated documents 401, landing page 200. The 503 confirms database unavailability rather than reporting false readiness.
- Initial attempt: integration was skipped because the configured local database returned ECONNREFUSED. Follow-up: a private temporary MariaDB server was provisioned, and the integration suite now passes with **9 subtests plus the parent test (10 reported passes), 0 failures, 0 skips**. The normal application database configuration was not changed.

## Real database test harness

`tests/database.integration.js` is opt-in. It creates and drops its own uniquely named disposable database; it never loads schema into the normal app database. Use a dedicated test server/user with CREATE/DROP DATABASE permission. Configure test credentials in your local shell or secret manager, not in source control or chat.

```bash
PACFAS_MYSQL_TEST=1 \
MYSQL_TEST_HOST=127.0.0.1 \
MYSQL_TEST_USER=YOUR_TEST_USER \
npm run test:integration
```

Set MYSQL_TEST_PASSWORD and MYSQL_TEST_PORT in the environment if required. For a Unix-socket-only test server, set MYSQL_TEST_SOCKET to its socket path; the test connection uses that instead of TCP. This is a one-shot integration test, not a server to leave running.

The harness checks a legacy-schema migration with text preservation, default registration roles, login/profile access, client linking, hearing SQL, upload metadata, version advancement, concurrent revision uploads, latest-file downloads, and access revocation after account demotion/deactivation on real SQL. It disables background OCR scheduling to isolate storage tests; it does not certify recognition quality or browser workflows. The harness **has executed successfully against MariaDB 10.8.3** in this environment. This verifies this MariaDB version, not every Oracle MySQL or production-server configuration.

## Remaining verification and limitations

- Migration execution, the exercised SQL/foreign-key paths and two concurrent revision uploads now pass on temporary MariaDB 10.8.3. Broader concurrency stress, the production database version/configuration and complete real-browser workflows remain unverified.
- Clear PNG/JPEG/TIFF recognition and a two-page scanned PDF now pass real recognition tests (see the latest browser report). English recognition is configured; handwriting, poor scans and mixed text/image PDFs remain quality limitations. The existing less-than-50-character PDF fallback heuristic is retained.
- Jobs are not durable, globally concurrency-limited or automatically resumed. Status persistence and offline recovery make failure visible, but do not substitute for a production queue.
- Hearing conflict detection still uses a one-hour start-time window. Update-time conflict prevention and fully serialized concurrent hearing scheduling remain follow-up work, not certified protections in this patch.
- Per-case ownership/assignment authorization is not introduced; office roles share archive access. Public/client roles are denied the archive. Confirm this policy before any client portal deployment.
- File-signature checks do not prove that an entire file is valid or free of malware. Recognition failures are reported separately from successful storage.
- Linked client names now display correctly and the silently ignored free-text creation field has been removed. Broader behavior outside the documented browser paths is not certified.
- Primary real-browser flows and a 390-pixel dashboard smoke check now pass. Full accessibility, broad device coverage, audit persistence and disaster-recovery certification remain outside scope.
- The repository already tracks `.env` and dependency files. New ignore rules prevent new generated files from being added, but do not remove tracked configuration or sanitize Git history. Review secret handling and rotate any exposed credentials before deployment; this patch does not copy or change existing credentials.

## Illustrated manual status

The initial manual gate has now been completed for the documented primary workflows. `docs/User_Manual.docx` contains 14 real application screenshots and explicit limitations. `docs/Browser_OCR_Validation.md` records 20 passing real-browser/OCR checks; this does not certify every possible document, device or production condition.


## Temporary database follow-up: successful

A real MariaDB 10.8.3 server was initialized under the ignored `.cache/mariadb/` directory. The development-only binary was obtained from the `SoftwareVerde/java-mariadb-linux` GitHub repository, whose README identifies it as precompiled MariaDB 10.8.3. Downloaded server parts were checked against their Git blob IDs before assembly. This is test provenance, not a recommendation to deploy that old third-party binary in production.

Source Git tree: `490463720eece054d4eb3b3037a1fcda771cfedd`.

The server ran with `--skip-networking`, accepting only a private Unix socket under a directory with mode 0700. It opened no TCP/public port. Test credentials were local disposable defaults, not credentials from the user's database. No change was made to `.env`.

Executed:

```bash
PACFAS_MYSQL_TEST=1 \
MYSQL_TEST_SOCKET="$PWD/.cache/mariadb/run/db.sock" \
MYSQL_TEST_USER=root \
npm run test:integration
```

Results:

1. Legacy schema migration preserved useful text, marked unfinished extraction FAILED, and enforced revision uniqueness.
2. Active account login verified an actual bcrypt hash and issued a token.
3. Public registration stored role 5 even when role 1 was requested.
4. Client creation, case linking and linked-case listing executed successfully.
5. Hearing creation, per-case listing and calendar listing executed successfully.
6. PDF MIME metadata fit the database, revision 2 became current, and downloads returned its bytes.
7. The active profile endpoint returned the current database account role.
8. Two concurrent revision uploads returned distinct versions 3 and 4; the current pointer became 4 and download bytes matched that revision.
9. Demoting an account denied archive access despite its older admin token; deactivation denied profile access.

After the run, a direct database query confirmed **zero disposable `pacfas_test_*` databases remained**. The temporary server was then stopped. Downloaded binaries and database files are ignored and are not committed. Background OCR scheduling was deliberately disabled in these storage integration tests; the PDF payload used for upload/download checks is signature-valid synthetic content, not a recognition-quality fixture. Real embedded-text PDF parsing remains covered by the separate passing regression test.

`npm test` was rerun after this follow-up: **54 passed, 0 failed, 0 skipped**. No application defect was found by these additional database checks, so this follow-up changes the test harness and validation notes, not production behavior.
