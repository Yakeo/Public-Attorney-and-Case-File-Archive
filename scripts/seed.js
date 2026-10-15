const db = require('../config/db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const firstNames = ['Juan','Maria','Jose','Ana','Pedro','Lucia','Carlos','Sofia','Miguel','Isabel','Ramon','Carmen','Diego','Elena','Luis','Patricia','Fernando','Rosa','Antonio','Teresa'];
const lastNames = ['Dela Cruz','Santos','Reyes','Garcia','Mendoza','Torres','Flores','Gonzales','Bautista','Villanueva','Ramos','Aquino','Castro','Lopez','Hernandez','Morales','Ortiz','Ramirez','Gutierrez','Jimenez'];
const specs = [1,2,3,4];
const statuses = [1,2,3,4];
const priorities = [1,2,3,4];
const categories = [1,2,3];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

(async () => {
  const hash = await bcrypt.hash('password123', 10);
  const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  // 10 attorneys
  const attorneyIds = [];
  const attorneyUserIds = [];
  for (let i = 0; i < 10; i++) {
    const fn = rand(firstNames);
    const ln = rand(lastNames);
    const email = `${fn.toLowerCase()}.${ln.toLowerCase().replace(/\s+/g,'')}@pacfas.gov`;
    const username = `${fn.toLowerCase()}${ln.toLowerCase().replace(/\s+/g,'')}${i}`;
    const [u] = await db.execute(
      `INSERT INTO user_account (role_id, username, email, password_hash, is_active, created_at, updated_at)
       VALUES (2, ?, ?, ?, 1, NOW(), NOW())`,
      [username, email, hash]
    );
    const userId = u.insertId;
    const attId = `A${String(userId).padStart(4, '0')}`;
    await db.execute(
      `INSERT INTO attorney (attorney_id, user_id, fname, lname, specialization_id, bar_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [attId, userId, fn, ln, rand(specs), `BAR-${randInt(2010,2024)}-${randInt(1000,9999)}`]
    );
    attorneyIds.push(attId);
    attorneyUserIds.push(userId);
    console.log(`Created attorney ${attId} ${fn} ${ln}`);
  }

  // 10 cases
  const caseIds = [];
  for (let i = 0; i < 10; i++) {
    const title = `${rand(['Civil','Criminal','Corporate'])} Case ${i + 1} - ${rand(lastNames)}`;
    const createdBy = attorneyUserIds[randInt(0, attorneyUserIds.length - 1)];
    const [r] = await db.execute(
      `INSERT INTO case_file (cf_name, description, category_id, status_id, priority_id, filing_date, creation_date, created_by, is_visible)
       VALUES (?, ?, ?, ?, ?, CURDATE(), CURDATE(), ?, 1)`,
      [title, `Seeded case file ${i + 1}.`, rand(categories), rand(statuses), rand(priorities), createdBy]
    );
    caseIds.push(r.insertId);
    // assign 1-2 attorneys
    const nAtt = randInt(1, 2);
    for (let j = 0; j < nAtt; j++) {
      await db.execute(
        `INSERT INTO case_attorney (cf_code, attorney_id, role_on_case, assigned_date) VALUES (?, ?, ?, CURDATE())`,
        [r.insertId, rand(attorneyIds), j === 0 ? 'Lead Counsel' : 'Co-Counsel']
      );
    }
    console.log(`Created case ${r.insertId}: ${title}`);
  }

  // documents per case
  for (const cfCode of caseIds) {
    const nDocs = randInt(1, 3);
    for (let d = 0; d < nDocs; d++) {
      const fname = `seed-doc-${cfCode}-${d + 1}.txt`;
      const fpath = path.join(uploadDir, fname);
      const text = `Seeded document for case ${cfCode}, version ${d + 1}.\nLorem ipsum dolor sit amet, consectetur adipiscing elit.`;
      fs.writeFileSync(fpath, text);
      const [docRes] = await db.execute(
        `INSERT INTO document (cf_code, doc_name, file_type, file_path, status_id, current_version_no, uploaded_by, date_added, is_deleted)
         VALUES (?, ?, ?, ?, 1, 1, ?, CURDATE(), 0)`,
        [cfCode, `Document ${d + 1}`, 'text/plain', fpath, attorneyUserIds[0]]
      );
      const docCode = docRes.insertId;
      await db.execute(
        `INSERT INTO document_version (document_code, version_no, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by, uploaded_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, NOW())`,
        [docCode, fname, fpath, text.length, 'text/plain', text, attorneyUserIds[0]]
      );
    }
  }

  // hearings per case
  for (const cfCode of caseIds) {
    if (Math.random() > 0.4) {
      const hearingDate = new Date();
      hearingDate.setDate(hearingDate.getDate() + randInt(1, 30));
      const hd = hearingDate.toISOString().slice(0, 19).replace('T', ' ');
      await db.execute(
        `INSERT INTO hearing_schedule (cf_code, hearing_date, venue, courtroom, hearing_type, assigned_judge, status_id, remarks, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
        [cfCode, hd, 'Hall of Justice', `Courtroom ${randInt(1, 5)}`, rand(['Arraignment','Pre-Trial','Trial']), rand(lastNames), 'Seeded hearing', attorneyUserIds[0]]
      );
    }
  }

  // clients
  for (let i = 0; i < 5; i++) {
    const fn = rand(firstNames);
    const ln = rand(lastNames);
    const [u] = await db.execute(
      `INSERT INTO user_account (role_id, username, email, password_hash, is_active, created_at, updated_at)
       VALUES (4, ?, ?, ?, 1, NOW(), NOW())`,
      [`${fn.toLowerCase()}${ln.toLowerCase().replace(/\s+/g,'')}${i}client`, `${fn.toLowerCase()}@client.com`, hash]
    );
    const [cl] = await db.execute(
      `INSERT INTO client (user_id, fname, lname, birth_date, email, city, region, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [u.insertId, fn, ln, '1990-01-01', `${fn.toLowerCase()}@client.com`, 'Cagayan de Oro', 'Northern Mindanao']
    );
    // link to a random case
    await db.execute(
      `INSERT INTO client_case (client_id, cf_code, client_role) VALUES (?, ?, ?)`,
      [cl.insertId, rand(caseIds), rand(['Plaintiff','Defendant','Petitioner'])]
    );
  }

  console.log('Seed complete.');
  process.exit(0);
})();
