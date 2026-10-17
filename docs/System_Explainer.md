# PACFAS: Explaining the Complicated Parts
## A code-based walkthrough and presentation guide

Public Attorney and Case File Archive System • Prepared 17 October 2026

Purpose: help you explain how the system works, not just name its technologies. Each section gives you a short explanation to say aloud, the relevant code, a step-by-step breakdown, and limits you should acknowledge.

Scope: reviewed against the current repository. Code excerpts are shortened where noted. This is a static code review, not proof that every feature works in a deployed environment. No application behavior was changed to produce this guide.

# 1. The big picture: how a request moves

## What you can say
“The browser handles the interface, Express receives requests, middleware checks access and inputs, controllers apply the business rules, and MySQL stores the records. Uploaded files live on disk; the database stores their locations and extracted text.”

## Trace one request
Browser → /api/v1 route → authentication → optional role check → optional file upload middleware → controller → database → JSON response → browser update.

Source: server.js; routes/documentRoutes.js; frontend/js/api.js.

```js
const API_BASE = '/api/v1';
if (token) headers['Authorization'] = `Bearer ${token}`;
const res = await fetch(`${API_BASE}${endpoint}`, options);
```

The frontend helper attaches the stored token and calls the backend using a relative address. Express mounts each router under a path such as /api/v1/documents. A controller is the function that handles the actual operation. A database query runs through mysql2's execute method.

Important distinction: the JSON API helper sends JSON. A real file upload needs multipart FormData, not JSON.stringify(file). The document upload endpoint expects the file field to be named document.

## Current frontend limitation
The upload form submit handler in frontend/js/case-details.js currently disables the button, hides the modal, checks the profile and refreshes the case view. It does not actually send FormData to the upload endpoint. Explain the OCR pipeline as backend functionality; do not claim that this particular form currently completes the upload flow. That wiring requires a separate fix.

# 2. OCR: turning document images into searchable text

## What you can say
“We use a hybrid extraction approach. For PDFs we first try reading embedded text. If that produces fewer than 50 characters, we render the pages into images and run English Tesseract recognition. Image uploads go directly to Tesseract. The result is stored for that document version so later searches use saved text rather than repeating OCR.”

Source: controllers/documentController.js → processOCRInBackground.

## First understand the two kinds of PDF
A text-based PDF contains characters that a parser can read directly. A scanned PDF may contain only pictures of pages. Those pictures need optical character recognition: software estimates which letters appear in the image.

Direct extraction is not OCR. Both paths produce text, but only image recognition needs Tesseract.

## Step A: choose a path
```js
if (String(filePath).toLowerCase().endsWith('.pdf')) {
  const dataBuffer = fs.readFileSync(filePath);
  const parsed = await pdfParse(dataBuffer);
  extractedText = (parsed.text || '').trim();
}
```

String converts the path into a string; toLowerCase allows an uppercase .PDF extension to match. endsWith checks the filename extension. readFileSync loads the file bytes and blocks the event loop while reading. await waits for parsing. The fallback empty string avoids calling trim on an absent value. trim removes surrounding whitespace.

This branch selection uses the filename extension, whereas the upload filter uses the reported MIME type. These are different checks, and neither alone proves that file contents are safe.

Compatibility caveat: package.json declares pdf-parse ^2.4.5, while this code uses a callable pdfParse(buffer) interface associated with earlier versions. Verify and align the installed package API before demonstrating PDF extraction. If this call throws, the outer catch logs the error; the scanned-PDF fallback is not reached. This guide describes the written control flow, not a verified successful PDF runtime.

## Step B: decide whether image recognition is needed
```js
if (extractedText.length < 50) {
  const pages = await pdfToPng(filePath, { verbosityLevel: 0 });
  // recognize each rendered page
}
```

The threshold is a heuristic, not an intelligent scan detector. A genuine text PDF with only 20 characters also takes the fallback. Conversely, a mixed PDF with enough embedded text may skip scanned pages entirely. pdfToPng rasterizes the PDF: it makes page images that Tesseract can read. verbosityLevel controls logging, not OCR quality.

## Step C: create a worker and recognize the pages
```js
worker = await Tesseract.createWorker('eng');
for (const page of pages) {
  const ret = await worker.recognize(page.content);
  const t = (ret.data.text || '').trim();
  if (t) ocrParts.push(`--- Page ${page.pageNumber} ---\n${t}`);
}
extractedText = ocrParts.join('\n\n');
```

A worker is the Tesseract recognition context. eng selects the English language model; the code does not automatically detect languages. recognize returns a result object, and data.text contains its text. The loop processes pages sequentially using one worker. Nonempty results receive page labels, and join combines them into one string.

Example: a two-page scanned affidavit becomes text with a Page 1 marker, recognized lines, then a Page 2 marker. This is not a reconstructed Word document or a guaranteed layout-preserving copy.

## Step D: release the worker
```js
finally {
  if (worker) await worker.terminate();
}
```

finally runs whether recognition succeeds or throws. Terminating the worker releases its resources. Without cleanup, repeated uploads could leave unnecessary workers consuming memory.

## Step E: handle ordinary images
```js
worker = await Tesseract.createWorker('eng');
const ret = await worker.recognize(filePath);
extractedText = ret.data.text || '';
```

Non-PDF paths go directly to recognition. This branch also terminates its worker in finally. Recognition quality depends on scan clarity, orientation, contrast, language and handwriting. Legal names, dates and amounts need human verification.

## Step F: save to the correct version
```sql
UPDATE document_version
SET extracted_text = ?
WHERE document_code = ? AND version_no = ?
```

The parameters are extractedText, documentCode and versionNumber. Both IDs matter: an older version's OCR job must update its own text, not overwrite a newer version's text. The original uploaded file remains separate from extracted_text.

## Why it runs “in the background”
```js
await connection.commit();
processOCRInBackground(documentCode, 1, req.file.path);
res.status(201).json({ /* upload accepted */ });
```

The controller deliberately does not await the OCR function. It starts extraction and sends a response without waiting for recognition to finish. The upload is saved before OCR completes.

This is not a durable job queue or a separate service. Some synchronous work, such as readFileSync, still runs on the server thread. A server restart can interrupt a job; there is no persisted retry queue, concurrency limit or automatic recovery here.

## What PROCESSING and COMPLETED really mean
```sql
CASE WHEN dv.extracted_text IS NOT NULL
THEN 'COMPLETED' ELSE 'PROCESSING' END AS ocr_status
```

NULL is treated as processing. Even an empty string is treated as completed. The code does not persist a FAILED status or a recognition confidence score. An outer failure may leave NULL indefinitely. A scanned-PDF fallback failure is logged inside its inner catch, after which the function can still save the earlier short or empty extraction.

Safe wording: “The status reflects whether a text value was stored, not whether OCR was accurate.”

# 3. Upload validation and transactional saving

## What you can say
“The system saves a document record and its initial version as one database transaction. Either both records succeed, or the database rolls them back. Since the actual file lives outside MySQL, error cleanup also tries to remove it from disk.”

Sources: config/multer.js; routes/documentRoutes.js; controllers/documentController.js → uploadAndProcessDocument; middleware/errorHandler.js.

## Before the controller runs
```js
authorizeRoles(1, 2, 3),
upload.single('document'),
documentController.uploadAndProcessDocument
```

The route first checks the role, then Multer receives one file in the document field, then the controller processes it. Multer accepts reported MIME types for PDF, PNG, JPEG and TIFF, with a limit of 25 × 1024 × 1024 bytes.

```js
const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
cb(null, `doc-${uniqueSuffix}${ext}`);
```

The generated filename reduces accidental name collisions. It is not a cryptographic identifier or an absolute uniqueness guarantee. Files are saved under uploads/documents.

## Transaction flow, shortened
```js
await connection.beginTransaction();
// INSERT document, with current_version_no = 1
// INSERT document_version, with version_no = 1
await connection.commit();
connection.release();
```

The document row is the parent record. The version row stores the specific file metadata and extracted text. commit makes the database changes permanent. release returns the connection to the pool; it does not delete the saved records.

On failure, the controller rolls back, releases the connection and attempts to delete the uploaded file. req.dbConnection also lets the central error handler attempt cleanup for an attached transaction.

A database transaction cannot atomically roll back a filesystem write. File cleanup is compensating cleanup, not the same thing as a fully atomic database-and-disk transaction. Production hardening would need reconciliation for orphaned files and careful post-commit error handling.

# 4. Document versioning: one document, several revisions

## What you can say
“A document is the logical archive item. A document version is a particular uploaded revision. New revisions keep the same document ID, receive an increasing version number, and have their own file metadata and extracted text.”

Source: controllers/documentController.js → uploadNewVersion, getDocumentVersions, listDocuments and downloadDocument.

```sql
SELECT MAX(version_no) AS max_version
FROM document_version
WHERE document_code = ? FOR UPDATE
```

```js
const nextVersionNumber = (existingVersions[0].max_version || 0) + 1;
```

MAX finds the highest existing version. If it is 2, the next version is 3. The function inserts that revision and updates document.current_version_no inside the same transaction. FOR UPDATE expresses a locking intent; do not present this aggregate query alone as proof that all concurrent uploads are race-free. A unique document/version constraint and suitable parent-row locking would make the invariant more robust.

Example: document 18 may have versions 1, 2 and 3. OCR for version 2 updates only document 18/version 2, even if version 3 already exists.

## How the current revision is selected
```sql
LEFT JOIN document_version dv
  ON dv.document_code = d.document_code
 AND dv.version_no = d.current_version_no
```

The ordinary list joins the current version instead of returning every revision. The versions endpoint returns history in descending version order.

Current limitation: uploadNewVersion updates current_version_no but does not update document.file_path. downloadDocument reads document.file_path directly. Therefore that download endpoint can still return the original upload after a newer revision is added. Do not claim that downloading always retrieves the newest revision.

# 5. Searching text extracted from documents

## What you can say
“We search the stored extraction rather than running OCR for each query. The database finds matching version text and returns the associated document and case information.”

Source: controllers/documentController.js → searchDocumentText.

```sql
FROM document_version dv
JOIN document d ON dv.document_code = d.document_code
WHERE dv.extracted_text LIKE ?
```

```js
const params = [q, `%${q}%`];
```

For a query of affidavit, the LIKE value becomes %affidavit%. The percent signs mean any surrounding characters. The JOIN connects each matching revision with its logical document. An optional case_id adds an AND d.cf_code = ? condition.

```sql
INSTR(LOWER(dv.extracted_text), LOWER(?)) AS match_position
```

INSTR reports the first occurrence's position; it is not a relevance score. LOWER normalizes case for that expression. LIKE matching still depends on the column's MySQL collation.

Important limits: this is SQL substring matching, not semantic search or an indexed FULLTEXT ranking engine. Search examines all matching versions, not only the current revision. Its query does not filter d.is_deleted, unlike the ordinary document list. The % and _ characters in user input retain LIKE wildcard behavior. Parameter binding prevents treating the parameter as SQL syntax, but does not turn wildcard characters into literal characters.

# 6. Passwords, JWTs and role checks

## What you can say
“Passwords are checked using bcrypt hashes. After login, the server issues a signed token containing the user and role IDs. Protected routes verify the token; selected routes also check whether the role is allowed.”

Sources: controllers/authController.js; middleware/auth.js; routes/authRoutes.js; routes/documentRoutes.js; frontend/js/api.js.

## Password hashing
```js
const passwordHash = await bcrypt.hash(password, 10);
const isMatch = await bcrypt.compare(password, user.password_hash);
```

Registration stores a salted one-way hash, not the original password. The work factor 10 controls bcrypt's computational cost. During login, compare checks the submitted password against the stored hash; it does not decrypt the stored value.

## Token creation
```js
const token = jwt.sign(
  { user_id: user.user_id, role_id: user.role_id },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
);
```

The payload identifies the user and role. JWT_SECRET signs it so unauthorized changes can be detected. The default lifetime is 24 hours unless configured otherwise. A signed token is not encrypted: do not put confidential document text or passwords in it.

## Authentication versus authorization
```js
jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
  if (err) return next(new CustomError('Invalid or expired token.', 401));
  req.user = user;
  next();
});
```

Authentication verifies the token and attaches its payload to req.user. Authorization checks whether allowedRoles.includes(userRole). A missing/invalid token produces 401; a disallowed role produces 403. Hiding a button in the frontend is not a substitute for these backend checks.

## Security limits to explain honestly
Role restrictions differ by route. For example, document uploads require roles 1, 2 or 3, while case creation permits roles 1 or 3. Some assignment routes only require authentication; route-level access does not automatically establish case-level access.

The public registration controller accepts role_id from the request and defaults to 5. That is a privilege-escalation risk unless the server restricts or ignores client-selected roles. The token verifier does not re-query account status or role, so token claims can remain valid until expiry even after database changes.

server.js exposes /uploads through express.static without authentication. Knowing a file URL can bypass the protected API download route. The frontend stores the token in localStorage, which is exposed to successful same-origin script injection. These are current hardening concerns, not protections already implemented.

# 7. Hearing conflict detection and admin override

## What you can say
“Before saving a hearing, the system checks whether the selected attorney—or the attorneys assigned to the case—has another hearing within one hour. It rejects a conflict unless an administrator explicitly requests an override.”

Source: controllers/hearingController.js → createHearing.

First, a supplied attorney_id becomes the check list. Otherwise, the controller loads attorney IDs from case_attorney for that case.

```sql
WHERE ca.attorney_id = ?
AND h.hearing_date BETWEEN DATE_SUB(?, INTERVAL 1 HOUR)
                       AND DATE_ADD(?, INTERVAL 1 HOUR)
```

For a proposed 10:00 hearing, the query checks 09:00 through 11:00, including both endpoints. It joins hearing_schedule to case_file and then case_attorney to discover hearings on that attorney's cases.

```js
const isAdmin = req.user && req.user.role_id === 1;
if (conflicts.length > 0 && !(override_conflict && isAdmin)) {
  return next(new CustomError('Scheduling conflict: ...', 409));
}
```

An administrator without an override request is still blocked. A nonadministrator cannot bypass it merely by setting override_conflict. HTTP 409 means the requested operation conflicts with existing state.

Limits: it compares start times, not actual hearing durations or travel times. The query does not exclude canceled hearings. If no attorney is available, no attorney conflict check occurs. The check and insert are not one serialized transaction, so simultaneous requests can pass the check before either hearing is inserted. Also, a supplied attorney_id is used for checking but is not saved as a dedicated hearing-attorney field in this insert; existing associations come through case assignments.

# 8. Many-to-many relationships and JOINs

## What you can say
“One case can have several attorneys, and one attorney can handle several cases. Rather than putting a list inside one field, we store the relationships in a linking table.”

Sources: database.sql; controllers/caseAssignmentController.js.

Illustrative relationship rows, not seed data:

```text
case_attorney_id | cf_code | attorney_id | role_on_case
1                | 42      | 7           | Lead
2                | 42      | 9           | Supporting
3                | 43      | 7           | Lead
```

Case 42 has attorneys 7 and 9. Attorney 7 handles cases 42 and 43. role_on_case and assigned_date describe the assignment, not the attorney globally.

```sql
FROM case_attorney ca
JOIN attorney a ON ca.attorney_id = a.attorney_id
LEFT JOIN specialization s ON a.specialization_id = s.specialization_id
WHERE ca.cf_code = ?
```

JOIN retrieves the matching attorney record. LEFT JOIN keeps the assignment even if no specialization matches. A foreign key enforces a valid relationship at the database level; a JOIN retrieves related data for a response. They are different concepts.

assignAttorney checks that the case and attorney exist and that the attorney's linked account is active before inserting the relationship. The displayed checks do not prevent duplicate assignments, so do not claim that the controller guarantees one row per attorney/case pair.

# 9. Case IDs and readable case numbers

## What you can say
“The unique identity is a numeric database primary key. The readable case number is a label assembled from the category code, creation year and padded numeric ID.”

Sources: database.sql; controllers/caseController.js → createCase and shapeCase; frontend/js/dashboard.js.

```sql
cf_code int(11) NOT NULL AUTO_INCREMENT
```

```js
const caseNumber =
  `${catCode}-${year}-${String(result.insertId).padStart(4, '0')}`;
```

If the database returns insertId 42, String converts it to "42" and padStart makes it "0042". Civil plus 2026 produces CIV-2026-0042. The next case could be CRM-2026-0043; there is no separate counter per category or annual reset here. Auto-increment values can have gaps, so they are not a reliable count of active cases.

The frontend's CIV-2026-XXXX is only a preview. The database assigns the real numeric part after insertion. The case_number string is not persisted by this insert; shapeCase rebuilds it when reading records. Changing the category can therefore change the displayed prefix while cf_code stays the same.

Current inconsistency: getPublicCases returns the raw cf_code as case_number, rather than the formatted value. Creation uses the Node.js current year, while subsequent shaping uses the stored creation date; server/database timezone differences around New Year deserve testing.

# 10. Error handling and the audit trail

## What you can say
“Async controller errors are forwarded to a shared handler, which returns consistent error JSON and attempts cleanup. Selected actions also append audit records, but audit failures are logged rather than stopping the main operation.”

Sources: utils/catchAsync.js; utils/customError.js; middleware/errorHandler.js; utils/auditLog.js; controllers/authController.js; controllers/hearingController.js; controllers/caseAssignmentController.js.

```js
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
```

catchAsync wraps an asynchronous controller. A rejected promise is passed to Express through next(error). This avoids repeating the same outer promise catch in every controller. Locally caught OCR errors do not automatically reach this handler.

The global handler attempts file deletion and transaction rollback when relevant request properties exist. It formats Multer size errors and sends JSON with status, statusCode and message. Development mode may include a stack trace; ordinary unexpected production errors get a generic message.

```sql
INSERT INTO user_log
(user_id, event_type, action_taken, target_cf_code,
 ip_address, device_info, timestamp)
VALUES (?, ?, ?, ?, ?, ?, NOW())
```

The audit helper stores who acted, what happened, an optional case reference, and request metadata. Confirmed callers include registration, login, attorney assignment and hearing creation. An import of logAction alone does not mean a feature actually writes an audit entry.

The helper catches its own failures, so the main action can succeed without an audit record. The comment calls the trail immutable, but append-only application behavior is not proof of database-enforced immutability or tamper resistance. Do not describe it as a guaranteed complete, immutable security ledger.

# 11. A five-minute explanation you can practice

## Opening — 30 seconds
“Our system separates the interface, API business logic, database and document files. The browser calls Express routes. Middleware checks access, controllers perform the operation, and MySQL stores related records.”

## OCR — 90 seconds
“The challenging part is that PDFs are not all alike. Some have embedded text; others are just scanned images. We first try direct PDF text extraction. Under the current rule, fewer than 50 characters triggers rendering pages to images and English Tesseract recognition. Image files use Tesseract directly. Each version gets its own extracted text. The server starts this after saving the upload and does not await recognition before responding. This is an in-process background task, not a durable queue, and recognition still needs human checking.”

## Data integrity — 60 seconds
“Each document has a parent record and revision records. We use a transaction when saving those related records, so a database failure does not leave only half the database operation. Files live outside the database, so separate cleanup is needed. New revisions increase the version number and move the current-version pointer.”

## Access and scheduling — 60 seconds
“Login checks bcrypt hashes and returns a signed JWT. Authentication verifies that token; authorization checks the permitted role. For scheduling, the system looks for hearings within one hour for the relevant attorneys and rejects conflicts unless an administrator requests an override.”

## IDs and closing — 60 seconds
“A label such as CIV-2026-0042 combines the selected category, year and database-generated ID 42. Related records use the numeric ID. Our main implementation concerns are completing frontend upload wiring, verifying the PDF parser API, making OCR failures visible, protecting static file access, and strengthening role and concurrency controls. Those are improvement areas, not features we should claim are finished.”

# 12. Questions you may be asked

## Does OCR understand the legal meaning of a document?
No. Tesseract recognizes characters from images. This code does not perform legal reasoning, summarize evidence or determine authenticity.

## Why not run OCR every time someone searches?
Saving the extracted text avoids repeating expensive recognition work. Search queries the saved text instead.

## Can OCR fail while the upload succeeds?
Yes. Database saving happens before background recognition. The file can exist even when recognition fails, and the current status model may not clearly expose that failure.

## Is a JWT encrypted? Is it the same as a password?
No. It is a signed credential with readable claims. The password is checked during login; the JWT is then used for subsequent requests until expiration or another rejection condition.

## Does using SQL parameters solve all security issues?
No. They separate values from SQL syntax. Access control, file validation, token handling, wildcard semantics and safe exposure of uploaded files remain separate concerns.

## Does version history guarantee that downloads use the current revision?
Not in the current code. Listing uses current_version_no, but the download endpoint uses the parent document.file_path. Those paths need to be aligned before making that claim.

## Which parts need the most explanation?
OCR branching and background execution; database/file consistency; version relationships; authentication versus authorization; and the limits of conflict checking. Case-number formatting is simpler but useful for demonstrating the difference between database identity and presentation.

# 13. Suggested demonstration checklist

1. Before demonstrating PDFs, verify the installed pdf-parse API and test one text PDF and one scanned PDF.
2. Wire or separately exercise the backend upload endpoint with a multipart document field; the present form does not send it.
3. Use a clear English scan and a deliberately poor scan to show why OCR is approximate.
4. Retrieve version history after waiting for extraction. Explain NULL versus non-NULL status rather than assuming success.
5. Search a known phrase and verify which revision matched.
6. Upload a revision and compare the current list with the download response to expose the current path mismatch.
7. Try a protected endpoint without a token, then with a disallowed role.
8. Schedule two hearings within an hour and explain the administrator override rule.
9. Explain an example case number while showing the numeric cf_code separately.
10. Use synthetic files and accounts, not confidential real client documents.

# 14. Quick source map and glossary

## Where to open the code
• server.js — route mounts, static frontend/uploads, central error handler.
• config/multer.js — file storage naming, reported MIME filtering, size limit.
• controllers/documentController.js — OCR, upload transactions, revisions, search and downloads.
• controllers/authController.js and middleware/auth.js — password checks, token creation and access checks.
• controllers/hearingController.js — attorney selection, conflict window, admin override and insertion.
• controllers/caseAssignmentController.js — assignment validation and relationship queries.
• controllers/caseController.js — case creation, display shaping and public summaries.
• frontend/js/case-details.js — document rendering and current upload form handler.
• frontend/js/dashboard.js — category-to-code preview mapping.
• utils/catchAsync.js, middleware/errorHandler.js, utils/auditLog.js — error forwarding, cleanup and audit writes.
• database.sql — primary keys, foreign keys and table definitions.

## Terms in plain English
• Primary key: the database field that identifies one row uniquely.
• Foreign key: a database rule linking a value to a valid row in another table.
• JOIN: a query operation that combines related rows.
• Transaction: a group of database changes committed together or rolled back.
• Middleware: a function that runs along the request path before the final handler or during error handling.
• Controller: the handler that implements an API operation.
• OCR: recognition of text characters in an image.
• Rasterization: converting a PDF page into an image.
• Worker: a recognition execution context that needs resource cleanup.
• JWT: a signed token carrying claims such as identity, role and expiration.
• Hash: a one-way password representation, not reversible encryption.
• Parameterized query: SQL with separately supplied values rather than concatenated user input.

Final reminder: distinguish intended design, code that exists, verified runtime behavior, and future improvements. A strong explanation is accurate about all four.
