# PACFAS — Version History & Change Log (Appendix)

**Project:** Attorney Directory and Case File Archive System (PACFAS)
**Course:** Elect 5 – Software Engineering
**Institution:** Gingoog City Colleges, Inc.
**Repository:** Yakeo/Public-Attorney-and-Case-File-Archive

This document records the incremental evolution of the system from its earliest
backend-only prototype to the current release. Versions are grouped by the
development stage they represent.

---

## v0.1.0 — Backend Controllers (Initial Prototype)
**Stage:** Backend only; no routes, no server wiring.
- `controllers/authController.js` — register, login, getProfile (JWT + bcrypt).
- `controllers/caseController.js` — createCase, getAllCases, getCaseById.
- `controllers/documentController.js` — upload + async Tesseract OCR, versioning, search.
- `controllers/hearingController.js` — create, list by case, update, date-range.
- Direct `mysql2` pool usage; no centralized error handling yet.

## v0.2.0 — Route Layer
**Stage:** Express routers introduced.
- `routes/authRoutes.js`, `caseRoutes.js`, `documentRoutes.js`, `hearingRoutes.js`.
- Endpoints mounted under `/api/v1/*`.
- Authentication middleware applied to protected routes.

## v0.3.0 — Error Handling & Utilities
**Stage:** Centralized error handling and async safety.
- `utils/customError.js`, `utils/catchAsync.js`.
- `middleware/errorHandler.js` (orphaned-file cleanup, transaction rollback, Multer error formatting).
- `middleware/auth.js` (JWT verify + role authorization).

## v0.4.0 — File Upload & OCR (Multer + Tesseract)
**Stage:** Multipart uploads and document OCR.
- `config/multer.js` — disk storage, MIME validation, 25 MB limit.
- Tesseract.js worker integration for image OCR.
- Known issue at this stage: missing `multer`/`tesseract.js` dependencies and schema mismatches caused runtime failures.

## v0.5.0 — Database & Server Wiring
**Stage:** Connection and Express app assembly.
- `config/db.js` — MySQL pool + connection check.
- `server.js` — body parsing, static serving, health check, route mounts, 404 handling.
- `.env` configuration (PORT, DB_*, JWT_SECRET).

## v0.6.0 — Frontend (HTML/CSS/JS)
**Stage:** Client-side UI added.
- Pages: `index.html`, `dashboard.html`, `case-details.html`, `attorney-profile.html`.
- `frontend/js/*` — auth, dashboard, case-details, landing, profile, theme.
- `api.js` initially a MOCK client for offline frontend testing.

## v1.0.0 — Integrated System (First Stable)
**Stage:** Frontend + backend connected conceptually; schema + controllers in place.
- Full-stack scaffold: auth, cases, documents, hearings, attorney directory pages.
- `database.sql` canonical schema (3NF, 18 tables).
- First "almost full-fledged" release.

## v1.1.0 — OCR PDF Support + Backend/DB Alignment + Attorney Directory
**Date:** 2026-10-16
### Added
- PDF-aware OCR: `pdf-parse` for text-based PDFs; Tesseract for images.
- `extracted_text` (+ file metadata) columns on `document_version`.
- Attorney Directory backend: `GET /api/v1/users/attorneys`, `GET /api/v1/users/:id`.
- Public case summaries: `GET /api/v1/cases/public?attorney_id=`.
- Seed data: roles, statuses, priorities, document/hearing statuses, 3 sample attorneys.
- CORS middleware.
### Changed
- Controllers aligned to canonical `database.sql` schema.
- `frontend/js/api.js` replaced mock with real `fetch` + JWT.
- `.env` / `config/db.js` DB name set to `pacfas_db`.
### Removed
- Duplicate native Express error handler.

## v1.2.0 — Client Profiles + Case Assignment (Slice A)
**Date:** 2026-10-16
### Added
- Client profile CRUD (`/api/v1/clients`) with auto-linked user account.
- Client↔Case links and Case↔Attorney assignment endpoints.
- Client role (role_id 4) auto-seed.
### Changed
- `routes/caseRoutes.js`, `routes/attorneyRoutes.js`, `server.js` updated.
### Notes
- Hearing-conflict prevention and audit logging remain pending (Slice B).
- Scanned/image-only PDF OCR remains unsupported (documented limitation).

---

## v1.3.0 — Hearing Conflict Prevention + Audit Logging (Slice B)
**Date:** 2026-10-16
### Added
- `utils/auditLog.js` — append-only `user_log` writer (fail-safe, never breaks main flow).
- Hearing conflict prevention in `createHearing`: blocks booking if any assigned attorney has a hearing within 1 hour (admin override via `override_conflict`).
- Audit logging calls in auth (register/login), case create, hearing create/update, document upload/version, client create, attorney assignment.
### Changed
- `hearingController.createHearing` accepts `attorney_id` and `override_conflict`.
### Notes
- Scanned/image-only PDF OCR still unsupported.
- Client/assignment frontend still pending.

## Known Limitations (current release)
1. Scanned/image-only PDFs are not OCR-searchable (text-based PDFs + images only).
2. Hearing schedule conflict prevention is now enforced (admin override available).
3. Audit trail (`user_log`) not yet implemented.
4. Attorney directory is read-only (no admin CRUD).
5. Client/assignment UI not yet present in the frontend.
6. Requires a provisioned MySQL/MariaDB instance with `database.sql` imported.
