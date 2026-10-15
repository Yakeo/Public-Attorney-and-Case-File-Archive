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
- Scanned/image-only PDF OCR now supported via rasterize + Tesseract fallback.

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

## v1.5.0 — Admin Attorney CRUD
**Date:** 2026-10-16
### Added
- Admin-only attorney management endpoints: `POST /api/v1/users` (create), `PATCH /api/v1/users/:id`, `DELETE /api/v1/users/:id` (soft-deactivate).
- `createAttorney` creates linked user_account (role Attorney) + attorney profile.
### Notes
- Public case-lookup UI, advanced search, secure downloads still pending.

## v1.6.0 — Advanced Case Search + Secure Download
**Date:** 2026-10-16
### Added
- Server-side case filters on `GET /api/v1/cases` (q, category, priority, status, attorney).
- Secure document download: `GET /api/v1/documents/:id/download` (auth required).
### Notes
- Scanned/image-only PDF OCR now supported via rasterize + Tesseract fallback.

## v1.7.0 — Scanned PDF OCR Support
**Date:** 2026-10-16
### Added
- Hybrid PDF OCR: text extraction first, rasterize + Tesseract fallback for scanned/image-only PDFs.
### Changed
- `processOCRInBackground` now handles both text-based and scanned PDFs.

## v1.8.0 — Admin Attorney UI
**Date:** 2026-10-16
### Added
- `admin.html` + `admin.js`: admin form to create attorneys and directory listing.
### Notes
- Secure download UI and advanced search UI still pending.

## v1.9.0 — Secure Download UI
**Date:** 2026-10-16
### Added
- Download links in case document list (authenticated).
### Notes
- Advanced search UI and public case-lookup UI remain basic.

## v2.0.0 — Advanced Search UI
**Date:** 2026-10-16
### Added
- Server-side filters wired to dashboard (status, category, priority, text).
### Notes
- Public case-lookup UI already available via attorney profile.

## v2.0.1 — Admin Link Gating
**Date:** 2026-10-16
### Changed
- Admin link hidden for non-admin users.

## v2.1.0 — Polish (Role Gating + Public Case Lookup)
**Date:** 2026-10-16
### Added
- `public-cases.html` for public case lookup.
- Role-based UI gating (admin link, create case, clients link, assign/link forms).
### Notes
- Remaining: automated tests, cloud/S3 storage.

## v2.2.0 — UI Polish + User Manual
**Date:** 2026-10-16
### Added
- `USER_MANUAL.md` (installation, prerequisites, feature guide, troubleshooting).
- `toast.js` global toast notifications; replaced alert() calls.
### Changed
- Role-based UI gating and public case lookup (already in v2.1.0).
### Notes
- Automated tests and cloud storage remain future work.

## v2.3.0 — Role Separation & Access Control
**Date:** 2026-10-16
### Added
- Role 5 (User) for registered public users (read-only).
- Role-based authorization on create/update/upload/client/assignment routes.
### Changed
- Registration defaults to User role (not Attorney).
- Removed auto-mock token injection in frontend.
### Notes
- Public users can view attorneys, cases, and download documents; CRUD restricted to staff/attorneys/admins.

## Known Limitations (current release)
1. (Resolved) Scanned/image-only PDFs are now OCR-searchable.
2. Hearing schedule conflict prevention is now enforced (admin override available).
3. Audit trail (`user_log`) not yet implemented.
4. Attorney directory is read-only (no admin CRUD).
5. Client/assignment UI not yet present in the frontend.
6. Requires a provisioned MySQL/MariaDB instance with `database.sql` imported.
