# PACFAS — User Manual

**Attorney Directory and Case File Archive System**
Version 2.1.0

---

## 1. Overview
PACFAS is a web-based system for law offices to:
- Archive and search case files and documents (with OCR text extraction).
- Manage clients, attorneys, hearings, and case assignments.
- Publish a public attorney directory and non-confidential case summaries.

It has two faces:
- **Public (no login):** attorney directory, attorney profiles, public case lookup.
- **Internal (login required):** case management, documents, hearings, clients, assignments, admin.

---

## 2. Prerequisites
Before installing, ensure you have:

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ (tested on 22) | https://nodejs.org |
| npm | 9+ | bundled with Node |
| MySQL or MariaDB | 8+ / 10.4+ | must be running and reachable |
| Git | any | to clone |
| (Optional) GraphicsMagick | any | only if you later swap the PDF rasterizer |

No other global tools are required. Tesseract OCR runs via the bundled `tesseract.js` (WebAssembly) — no system Tesseract install needed.

---

## 3. Installation

### 3.1 Clone the repository
```bash
git clone https://github.com/Yakeo/Public-Attorney-and-Case-File-Archive.git
cd Public-Attorney-and-Case-File-Archive
```

### 3.2 Install dependencies
```bash
npm install
```
This installs Express, MySQL driver, JWT, bcrypt, Multer, Tesseract.js, pdf-parse, pdf-to-png-converter, CORS, etc.

### 3.3 Create the database
Start your MySQL/MariaDB server, then:
```bash
mysql -u root -p -e "CREATE DATABASE pacfas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p pacfas_db < database.sql
```
This creates all 18 tables and seeds roles, statuses, priorities, and 3 sample attorneys.

### 3.4 Configure environment
Edit `.env` (or create one):
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pacfas_db
DB_PORT=3306
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=24h
```

### 3.4.1 (Optional) Seed sample data
```bash
npm run seed
```
This inserts 10 attorneys, 10 cases, sample documents, hearings, and 5 clients.

### 3.5 Run the server
```bash
npm start          # production
# or
npm run dev        # with nodemon (auto-restart)
```
Open http://localhost:3000 in your browser.

---

## 4. First-time setup
1. The seed creates 3 attorney accounts (password `password123`):
   - clara.vance@pacfas.gov
   - m.reyes@pacfas.gov
   - elena@pacfas.gov
2. Log in with one of them to reach the dashboard.
3. To create an admin account, insert a row into `user_account` with `role_id = 1` (or update an existing user's role_id to 1), then log in.
4. Admins can create more attorneys via the Admin page.

---

## 5. User roles
| Role | Capabilities |
|---|---|
| Public (no login) | Browse attorney directory, view profiles, view public case summaries. |
| Attorney (role 2) | View/manage assigned cases, upload documents, schedule hearings. |
| Staff (role 3) | Create cases, clients, assign counsel, manage records. |
| Admin (role 1) | Everything + manage attorneys, view audit logs, override scheduling conflicts. |

---

## 6. Feature guide

### 6.1 Dashboard
- View case statistics (active, pending, total documents).
- Search and filter cases by status, category, priority.
- Create a new case (staff/admin).
- Open a case to see details.

### 6.2 Case details
- View case info, hearings, documents.
- Upload documents (PDF/PNG/JPG/TIFF, max 25 MB) — OCR runs in the background.
- View extracted OCR text per document; download files.
- Schedule hearings; view hearing list.
- (Staff/admin) Assign counsel and link clients.

### 6.3 Clients
- Create and list client profiles.
- Link clients to cases with a role (Plaintiff/Defendant/Petitioner).

### 6.4 Attorney directory (public)
- Browse and search attorneys by name/specialization.
- View an attorney's profile and public case history.

### 6.5 Admin
- Create new attorney accounts (auto-creates linked user).

### 6.6 Search
- Document text search: `GET /api/v1/documents/search?q=keyword`.
- Case filters: status, category, priority, text.

---

## 7. API overview
All endpoints are under `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/register | No | Register user |
| POST | /auth/login | No | Login, returns JWT |
| GET | /auth/me | Yes | Current user |
| GET | /cases | Yes | List cases (filters supported) |
| POST | /cases | Yes | Create case |
| GET | /cases/:id | Yes | Case details |
| GET | /cases/public | No | Public case summaries |
| GET | /clients | Yes | List clients |
| POST | /clients | Yes | Create client |
| GET | /documents | Yes | List documents (by case_id) |
| POST | /documents/upload | Yes | Upload document (OCR async) |
| GET | /documents/search | Yes | Full-text search |
| GET | /documents/:id/download | Yes | Download file |
| GET | /hearings | Yes | List hearings (by case_id) |
| POST | /hearings | Yes | Schedule hearing |
| GET | /users/attorneys | No | Attorney directory |
| GET | /users/:id | No | Attorney profile |
| POST | /users | Admin | Create attorney |

---

## 8. Troubleshooting
- **"Database connection error: ECONNREFUSED"**: MySQL isn't running or `.env` credentials are wrong. Start MySQL and verify DB_NAME.
- **"ER_DUP_ENTRY" on case create**: case title/code already exists.
- **OCR returns empty for a PDF**: the PDF is likely scanned (image-only). As of v1.7.0, scanned PDFs are rasterized and OCR'd automatically; very low-quality scans may still yield poor text.
- **401 Unauthorized**: token missing/expired. Log in again.
- **403 Forbidden**: your role lacks permission (e.g., non-admin creating attorneys).
- **File upload fails**: check file type (PDF/PNG/JPG/TIFF) and size (≤25 MB).

---

## 9. Limitations
- Cloud/S3 storage not implemented; files are stored on local disk under `uploads/`.
- No automated tests yet.
- Email notifications not implemented.
- Scanned PDF OCR quality depends on scan resolution.

---

## 10. Support
Report issues at: https://github.com/Yakeo/Public-Attorney-and-Case-File-Archive/issues
