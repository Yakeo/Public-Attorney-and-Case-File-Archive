# Changelog

All notable changes to the Attorney Directory and Case File Archive System (PACFAS) are documented here.

## [1.6.0] - 2026-10-16

### Added
- Advanced case search filters and secure document download endpoint.

## [1.5.0] - 2026-10-16

### Added
- Admin attorney CRUD: create/update/deactivate attorney records (admin role required).

## [1.4.0] - 2026-10-16

### Added
- Slice A frontend: client profiles page, case counsel/clients panels.

## [1.3.0] - 2026-10-16

### Added
- **Slice B — Hearing conflict prevention + Audit logging:**
  - `utils/auditLog.js`: append-only `user_log` writer (fail-safe).
  - Conflict check in `POST /api/v1/hearings`: blocks if an assigned attorney has a hearing within 1 hour (admin override via `override_conflict`).
  - Audit log calls across auth, cases, hearings, documents, clients, assignments.

### Changed
- `hearingController.createHearing` accepts `attorney_id` and `override_conflict`.

### Notes
- Scanned/image-only PDF OCR still unsupported.
- Client/assignment frontend still pending.

## [1.2.0] - 2026-10-16

### Added
- **Slice A — Client profiles + Case assignment:**
  - `controllers/clientController.js` + `routes/clientRoutes.js`: CRUD for client profiles (`POST/GET/PATCH /api/v1/clients`), auto-creates a linked `user_account` (role Client) when no `user_id` is supplied.
  - Client↔Case links: `POST/GET /api/v1/clients/:id/cases`, `GET /api/v1/cases/:id/clients`.
  - `controllers/caseAssignmentController.js`: assign attorneys to cases (`POST /api/v1/cases/:id/attorneys`), list case counsel (`GET .../attorneys`), list an attorney's cases (`GET /api/v1/attorneys/:id/cases`). Inactive attorneys cannot be assigned; reassignment creates a new record (history preserved).
- **Client role** (role_id 4) auto-seeded by `createClient` when missing.

### Changed
- `routes/caseRoutes.js`: added attorney-assignment and client-link routes (protected).
- `routes/attorneyRoutes.js`: added authenticated `GET /:id/cases`.
- `server.js`: mounted `/api/v1/clients`.

### Notes
- Hearing-conflict prevention (1-hour buffer) and audit logging (`user_log`) remain pending (Slice B).
- Scanned/image-only PDF OCR remains unsupported (text-based PDFs + images only).

## [1.1.0] - 2026-10-16

### Added
- **PDF-aware OCR module** (`controllers/documentController.js`): `processOCRInBackground` now detects `.pdf` files and extracts text via `pdf-parse`, falling back to Tesseract.js for image formats (PNG/JPEG/TIFF). Enables full-text search across uploaded PDFs.
- **`extracted_text` (and file metadata) columns** on `document_version` in `database.sql` to persist OCR output for search.
- **Attorney Directory backend** (`controllers/attorneyController.js`, `routes/attorneyRoutes.js`): public endpoints `GET /api/v1/users/attorneys`, `GET /api/v1/users/:id` (and `/api/v1/attorneys/*` aliases) returning sanitized attorney profiles with specialization.
- **Public case summaries** (`GET /api/v1/cases/public?attorney_id=`) in `caseController.getPublicCases`, filtered by `is_visible = 1`.
- **Seed data** in `database.sql`: roles (Admin/Attorney/Staff), case statuses (incl. ARCHIVED), priorities (incl. URGENT), document statuses (ACTIVE/SUPERSEDED/ARCHIVED), plus 3 sample attorneys linked to user accounts (password: `password123`).
- **CORS middleware** in `server.js` for cross-origin API testing.
- **`CHANGELOG.md`** and version bump to 1.1.0.

### Changed
- **Controllers aligned to the canonical `database.sql` schema** (per the thesis data dictionary):
  - `caseController`: `cf_code`/`cf_name` instead of `case_id`/`case_number`; returns frontend-friendly aliases.
  - `documentController`: `document_code`/`cf_code`/`version_no`; added `listDocuments` for `GET /documents?case_id=`.
  - `hearingController`: `hearing_schedule` table (`cf_code`, `venue`, `courtroom`, `hearing_type`, `assigned_judge`, `status_id`).
  - `authController`: `/auth/me` returns `full_name`.
- **`config/db.js`**: default DB name `pacfas_db`; connection errors now log code + message.
- **`.env`**: `DB_NAME=pacfas_db`.
- **Frontend `api.js`**: replaced mock with real `fetch` to `/api/v1` with JWT bearer auth.
- **`routes/hearingRoutes.js`**: added `GET /hearings?case_id=` convenience.
- **`routes/documentRoutes.js`**: added `GET /documents` (list by case).
- **`routes/caseRoutes.js`**: `/public` route placed before auth middleware.

### Removed
- Duplicate native Express error handler in `server.js` (centralized `errorHandler` is the single handler).

### Known limitations
- No MySQL/MariaDB instance in this dev sandbox; endpoints requiring DB return 500 until a DB is provisioned and `database.sql` is imported.
- OCR on scanned (image-only) PDFs is not supported yet — only text-based PDFs; image OCR covers PNG/JPEG/TIFF.
- Attorney directory is read-only; admin CRUD for attorneys is not yet implemented.
- Client profiles, case assignment, hearing-conflict prevention, audit logging, and public case lookup UI are pending (schema exists).

## [1.0.0] - Initial
- Initial commit: Express backend, MySQL schema, mock frontend.
