# Defense demo validation

Executed **2026-10-17** on Linux with Node.js v22.22.3 and a private MariaDB **10.8.3** instance, accessed only through a local Unix socket. No configured production database was used.

## Results

| Check | Result |
|---|---|
| Full regression suite, including 12 new demo tests | **66 passed**, 0 failed |
| Existing real-database integration | **10 reported passes** (9 subtests + parent) |
| New demo integration | **12 reported passes** (11 subtests + parent) |
| Independent ZIP extraction and repeat integration | **12 reported passes**, 0 failed |
| ZIP paths and content hashes | **97 entries**, 92 version files, valid model hash |
| Seeded row counts | 5 attorneys, 18 clients, 18 cases, 90 documents, 92 versions, 8 hearings |
| Repeat import | Verified/skipped; no duplicate versions |
| Existing unmarked database | Rejected; sentinel record unchanged |
| Manifest fingerprint mismatch | Rejected without rewriting records |
| Demo authentication | All 8 supplied logins accepted; 18 client profiles inactive |
| Private data | Unauthenticated documents 401; public role private archive 403; raw upload URL 404 |
| Downloads | All **90 current downloads** returned 200 and matched source SHA-256 |
| Actual OCR | App extractor independently read image-only PDF and PNG; both contained ORCHID |
| Full-text search | 5 ORCHID results; 2 REVISIONTWO results |
| Revisions | DEMO-02/03 intake histories [2,1]; current download matches version 2 |
| Relationships | DEMO-03 has 2 linked clients and 2 assigned attorneys |
| Hearing conflict | Staff request for DEMO-06 at 09:30 on 2026-10-31 rejected with 409; hearing count stays 8 |

The builder performs genuine text extraction/OCR before writing completed statuses. The application OCR check above independently exercises the final PDF/PNG bytes. No OCR recognizer, database, or HTTP API was mocked in the new integration suite. The scan unit check also confirms the image-only PDF has less than 50 selectable text characters.

## Artifact identity

- Download: `demo-data/PACFAS-Defense-Demo.zip`
- ZIP size: **2,528,850 bytes**
- ZIP SHA-256: `c64a1e2ab406fc6323bbe2206405e445bb788a028d61b859f7e49a8c0173ab03`
- Manifest SHA-256: `0932253ce71820f939517552763a75c95f809577eeb1e290337f5c90138c4244`
- Reference date: **2026-10-17**
- Files: **91 PDFs + 1 PNG**; 90 logical documents plus 2 additional revisions
- Extraction packages: pdf-parse 2.4.5; tesseract.js 7.0.0; pdfkit 0.20.2; fflate 0.8.3
- Language source: [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), English model; SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`; included Apache 2.0 license.

## Reproduction

Use the commands in [Defense_Demo.md](Defense_Demo.md). In this sandbox the English model was downloaded through the authenticated GitHub CLI and passed with `--language-data` because Node's direct HTTPS request reported a local certificate-chain error. TLS verification was **not** disabled. Two complete builds produced identical manifests, and the final ZIP was extracted into a new directory and installed/tested from that extracted bundle.

The requested downloadable ZIP is now committed at `demo-data/PACFAS-Defense-Demo.zip`; it contains the fictional records and licensed English model. Extracted bundles, test database binaries/data, and runtime uploads remain ignored. Download the ZIP from GitHub or rebuild with the checked-in scripts. The MariaDB mirror used for this isolated test was SoftwareVerde/java-mariadb-linux, with downloaded Git blobs checked by Git object SHA-1; it is not a recommended production installer.

These checks cover the dataset, real API, database isolation/idempotence and OCR. They are not a new cross-browser/Windows certification or a legal-accuracy review. The previously delivered illustrated user manual and browser validation remain separate deliverables.

## GitHub distribution update

The package was regenerated from the checked-in builder on 2026-10-17 for permanent GitHub distribution. The walkthrough inside the ZIP now describes the tracked ZIP location. All 92 version-file hashes and the English model were validated again with `loadBundle`; the earlier database integration results above refer to the original dataset validation.
