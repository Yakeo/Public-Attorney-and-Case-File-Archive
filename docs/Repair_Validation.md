# Security, document workflow and OCR repair notes

Date: 17 October 2026. Applies to this branch's repaired implementation; the earlier System Explainer describes the pre-repair code and is not an updated operational manual.

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
- `npm test`: **52 passed, 0 failed, 0 skipped**.
- Tests exercise real Express routing/middleware/controllers with a fake database, actual bcrypt/JWT behavior, upload validation/size cleanup, rollback and commit handling, current revision download bytes, conditional retries, frontend event logic in a fake DOM, and shared authenticated multipart/download helpers.
- OCR tests exercise persisted state transitions with fake recognition and fake database writes, worker cleanup, empty/failed recognition, corrupt PDFs and conditional claiming. The text-PDF test uses a genuine generated PDF and the real installed PDF parser; it does not mock parser output.
- Actual non-mocked server smoke checks: `/health` 200, `/ready` 503, raw `/uploads` 404, unauthenticated documents 401, landing page 200. The 503 confirms database unavailability rather than reporting false readiness.
- `npm run test:integration`: **one suite explicitly skipped**, because this workspace has no reachable MySQL/MariaDB server. A direct configured connection attempt returned ECONNREFUSED. This is not counted as a database-backed pass.

## Real database test harness

`tests/database.integration.js` is opt-in. It creates and drops its own uniquely named disposable database; it never loads schema into the normal app database. Use a dedicated test server/user with CREATE/DROP DATABASE permission. Configure test credentials in your local shell or secret manager, not in source control or chat.

```bash
PACFAS_MYSQL_TEST=1 \
MYSQL_TEST_HOST=127.0.0.1 \
MYSQL_TEST_USER=YOUR_TEST_USER \
npm run test:integration
```

Set MYSQL_TEST_PASSWORD and MYSQL_TEST_PORT in the environment if required. This is a one-shot integration test, not a server to leave running.

The harness checks a legacy-schema migration with text preservation, default registration roles, login, client linking, hearing SQL, upload metadata, version advancement and latest-file downloads on real SQL. It disables background OCR scheduling to isolate storage tests; it does not certify recognition quality or browser workflows. The harness has been syntax-checked but **has not executed its database subtests in this environment**.

## Remaining verification and limitations

- Migration execution, real SQL/foreign keys, concurrent revision uploads and complete browser workflows still need the reachable test database.
- Real scanned-PDF/image recognition and language-model availability need testing. English recognition is configured; handwriting, poor scans and mixed text/image PDFs remain quality limitations. The existing less-than-50-character PDF fallback heuristic is retained.
- Jobs are not durable, globally concurrency-limited or automatically resumed. Status persistence and offline recovery make failure visible, but do not substitute for a production queue.
- Hearing conflict detection still uses a one-hour start-time window. Update-time conflict prevention and fully serialized concurrent hearing scheduling remain follow-up work, not certified protections in this patch.
- Per-case ownership/assignment authorization is not introduced; office roles share archive access. Public/client roles are denied the archive. Confirm this policy before any client portal deployment.
- File-signature checks do not prove that an entire file is valid or free of malware. Recognition failures are reported separately from successful storage.
- The existing case client-name display/persistence mismatch and broader business/UI behavior outside the repaired paths are not certified by this targeted suite.
- No real-browser, mobile, accessibility, full audit persistence or disaster-recovery certification was completed.
- The repository already tracks `.env` and dependency files. New ignore rules prevent new generated files from being added, but do not remove tracked configuration or sanitize Git history. Review secret handling and rotate any exposed credentials before deployment; this patch does not copy or change existing credentials.

## Illustrated manual status

The Word user manual with screenshots remains deferred. The requested gate was verified working workflows, not merely passing isolated tests. Once a real database is available, run the integration harness and role-specific browser workflows, fix any remaining issues, and capture screenshots using synthetic records. Do not use mock screenshots to imply a fully verified live system.
