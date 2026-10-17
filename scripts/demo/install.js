const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { VERSION, DEMO_PASSWORD, dateOffset, createPlan } = require('./plan');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const connectionTargets = new WeakMap(); // Prepared statements bind unqualified table names to their original schema.
const ROOT = path.resolve(__dirname, '../..');

function assertTarget(database, confirmed) {
  if (!confirmed || !/^[a-zA-Z][a-zA-Z0-9_]{0,47}_demo$/.test(database || '')) {
    throw new Error('Explicit --confirm-demo and a database name ending in _demo are required. Normal app databases are never seeded.');
  }
}
function schemaForDemo(source) {
  const marker = source.indexOf('-- Seed attorneys (linked to user accounts)');
  if (marker < 0) throw new Error('Schema seed boundary changed; review before installing.');
  return source.slice(0, marker) + '\nCOMMIT;\n';
}
async function loadBundle(bundle) {
  const raw = await fs.readFile(path.join(bundle, 'manifest.json'));
  const plan = JSON.parse(raw);
  if (plan.version !== VERSION || plan.attorneys.length !== 5 || plan.clients.length !== 18 || plan.cases.length !== 18 || plan.documents.length !== 90) {
    throw new Error('Unexpected demo manifest; use the generated defense-v1 package.');
  }
  const expected = createPlan(plan.date);
  for (const key of ['version', 'date', 'accounts', 'clients', 'attorneys', 'cases']) {
    if (JSON.stringify(plan[key]) !== JSON.stringify(expected[key])) throw new Error(`Unexpected manifest metadata: ${key}`);
  }
  const names = new Set(), keys = new Set(); let versions = 0;
  for (const c of plan.cases) {
    const documents = plan.documents.filter(d => d.caseKey === c.key);
    if (documents.length !== 5) throw new Error('Each case must have five documents.');
    for (const doc of documents) {
      if (keys.has(doc.key)) throw new Error('Duplicate document key.'); keys.add(doc.key);
      if (!doc.versions.length || doc.versions.length > 2) throw new Error('Invalid revision count.');
      for (const [i, version] of doc.versions.entries()) {
        if (!/^files\/DEMO-\d{2}-doc[1-5]-v[12]\.(pdf|png)$/.test(version.file) || names.has(version.file) || version.number !== i + 1) {
          throw new Error('Invalid or duplicate file path/version.');
        }
        names.add(version.file);
        const bytes = await fs.readFile(path.join(bundle, version.file));
        if (digest(bytes) !== version.sha256 || bytes.length !== version.size) throw new Error(`Missing/changed demo file: ${version.file}`);
        if (version.ocrStatus !== 'COMPLETED' || !version.extractedText?.includes(c.marker)) throw new Error('Unverified extraction in manifest.');
        versions++;
      }
    }
  }
  if (versions !== 92 || names.size !== 92) throw new Error('Expected exactly 92 distinct version files.');
  if (plan.languageModel.file !== 'language-data/eng.traineddata' || digest(await fs.readFile(path.join(bundle, plan.languageModel.file))) !== plan.languageModel.sha256) {
    throw new Error('English language data is missing or changed.');
  }
  return { plan, hash: digest(raw) };
}
async function receiptFor(db) {
  const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='demo_dataset'");
  if (!tables.length) return null;
  const [rows] = await db.execute('SELECT manifest_sha256, receipt_json FROM demo_dataset WHERE dataset_key=?', [VERSION]);
  return rows[0] || null;
}
async function verifyInstall(db, bundle, root = ROOT) {
  const { plan, hash } = await loadBundle(bundle);
  const marker = await receiptFor(db);
  if (!marker?.receipt_json || marker.manifest_sha256 !== hash) throw new Error('No completed matching demo install. No data was changed.');
  const receipt = JSON.parse(marker.receipt_json);
  const ids = Object.values(receipt.cases);
  const [cases] = await db.query(`SELECT cf_code, is_visible FROM case_file WHERE cf_code IN (${ids.map(() => '?').join(',')})`, ids);
  if (cases.length !== 18) throw new Error('A seeded case is missing.');
  for (const c of plan.cases) {
    const row = cases.find(r => r.cf_code === receipt.cases[c.key]);
    if (Boolean(row.is_visible) !== c.public) throw new Error(`Publication differs from the demo baseline: ${c.ref}`);
  }
  const [attorneys] = await db.query('SELECT attorney_id FROM attorney WHERE attorney_id IN (?,?,?,?,?)', plan.attorneys.map(a => a.id));
  if (attorneys.length !== 5) throw new Error('A seeded attorney is missing.');
  const clientIds = Object.values(receipt.clients);
  const [clients] = await db.query(`SELECT client_id FROM client WHERE client_id IN (${clientIds.map(() => '?').join(',')})`, clientIds);
  if (clients.length !== 18) throw new Error('A seeded client is missing.');
  for (const c of plan.cases) {
    const [counts] = await db.execute('SELECT COUNT(*) AS n FROM document WHERE cf_code=? AND is_deleted=0', [receipt.cases[c.key]]);
    if (counts[0].n < 5) throw new Error(`${c.ref} has fewer than five documents.`);
  }
  for (const doc of plan.documents) {
    const id = receipt.documents[doc.key];
    for (const v of doc.versions) {
      const [rows] = await db.execute('SELECT file_path, extracted_text, ocr_status FROM document_version WHERE document_code=? AND version_no=?', [id, v.number]);
      const expected = receipt.paths[v.file];
      if (!rows.length || rows[0].file_path !== expected || rows[0].ocr_status !== 'COMPLETED' || rows[0].extracted_text !== v.extractedText) {
        throw new Error(`Stored version differs from the demo baseline: ${doc.key}/${v.number}`);
      }
      if (digest(await fs.readFile(path.join(root, expected))) !== v.sha256) throw new Error(`Installed file differs: ${expected}`);
    }
    const [current] = await db.execute(`SELECT d.current_version_no, dv.file_path FROM document d JOIN document_version dv
      ON dv.document_code=d.document_code AND dv.version_no=d.current_version_no WHERE d.document_code=?`, [id]);
    if (!current.length || current[0].current_version_no < doc.versions.at(-1).number) throw new Error('Invalid current version pointer.');
    await fs.access(path.resolve(root, current[0].file_path));
  }
  const [shared] = await db.execute('SELECT COUNT(*) AS n FROM case_attorney WHERE cf_code=?', [receipt.cases['case-3']]);
  const [links] = await db.execute('SELECT COUNT(*) AS n FROM client_case WHERE cf_code=?', [receipt.cases['case-3']]);
  if (shared[0].n < 2 || links[0].n < 2) throw new Error('Shared counsel/client showcase is incomplete.');
  return { receipt, counts: plan.counts, status: 'verified' };
}
async function install(db, database, bundle, root = ROOT) {
  assertTarget(database, true);
  const [selected] = await db.query('SELECT DATABASE() AS name');
  if (selected[0].name !== database) throw new Error('Selected database does not match the explicit demo target.');
  const { plan, hash } = await loadBundle(bundle);
  if (connectionTargets.has(db) && connectionTargets.get(db) !== database) throw new Error('Use a fresh connection for each demo database.');
  connectionTargets.set(db, database);
  const [lock] = await db.execute('SELECT GET_LOCK(?, 0) AS acquired', [`pacfas-demo:${database}`]);
  if (!lock[0].acquired) throw new Error('Another demo installer is using this database.');
  let stage, published = false, commitAttempted = false;
  const dest = path.join(root, 'uploads', VERSION, database);
  try {
    const [tables] = await db.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    let marker = await receiptFor(db);
    if (!tables[0].n) {
      await db.query(schemaForDemo(await fs.readFile(path.join(ROOT, 'database.sql'), 'utf8')));
      await db.query(`CREATE TABLE demo_dataset (dataset_key VARCHAR(64) PRIMARY KEY, manifest_sha256 CHAR(64) NOT NULL, receipt_json LONGTEXT DEFAULT NULL)`);
      await db.execute('INSERT INTO demo_dataset (dataset_key,manifest_sha256) VALUES (?,?)', [VERSION, hash]);
      marker = { manifest_sha256: hash, receipt_json: null };
    }
    if (!marker || marker.manifest_sha256 !== hash) throw new Error('Target is not an empty or matching generator-owned demo database. Refusing to modify it.');
    if (marker.receipt_json) return { ...(await verifyInstall(db, bundle, root)), alreadyInstalled: true };
    for (const table of ['user_account', 'case_file', 'client', 'document', 'attorney']) {
      const [rows] = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
      if (rows[0].n) throw new Error('Incomplete install contains records; preserve it and inspect before retrying.');
    }
    try { await fs.access(dest); throw new Error(`Destination already exists; preserved ${dest}. Use a fresh demo database or inspect the interrupted install.`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    stage = await fs.mkdtemp(path.join(path.dirname(dest), '.install-'));
    const paths = {};
    for (const doc of plan.documents) for (const v of doc.versions) {
      const copied = path.join(stage, path.basename(v.file));
      await fs.copyFile(path.join(bundle, v.file), copied);
      if (digest(await fs.readFile(copied)) !== v.sha256) throw new Error(`Bundle file changed during copy: ${v.file}`);
      paths[v.file] = path.posix.join('uploads', VERSION, database, path.posix.basename(v.file));
    }
    await db.beginTransaction();
    const receipt = { users: {}, clients: {}, cases: {}, documents: {}, paths };
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const a of plan.accounts) {
      const [row] = await db.execute('INSERT INTO user_account (role_id,username,email,password_hash,is_active) VALUES (?,?,?,?,1)', [a.role, a.username, a.email, passwordHash]);
      receipt.users[a.key] = row.insertId;
    }
    for (const a of plan.attorneys) await db.execute('INSERT INTO attorney (attorney_id,user_id,fname,lname,specialization_id,bar_number) VALUES (?,?,?,?,?,?)',
      [a.id, receipt.users[a.account], a.fname, a.lname, a.specialization, a.bar]);
    for (const c of plan.clients) {
      const clientHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      const [user] = await db.execute('INSERT INTO user_account (role_id,username,email,password_hash,is_active) VALUES (5,?,?,?,0)', [c.key, c.email, clientHash]);
      const [row] = await db.execute('INSERT INTO client (user_id,fname,lname,birth_date,email,city,region) VALUES (?,?,?,?,?,?,?)',
        [user.insertId, c.fname, c.lname, c.birthDate, c.email, 'Demo City', 'Fictional Training Region']);
      receipt.clients[c.key] = row.insertId;
    }
    for (const c of plan.cases) {
      const [row] = await db.execute(`INSERT INTO case_file (cf_name,description,category_id,status_id,priority_id,filing_date,creation_date,is_visible,created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`, [c.title, `SYNTHETIC DEMO DATA. ${c.topic}. Search marker ${c.marker}. No real client information.`, c.category, c.status, c.priority, c.filing, c.created, c.public ? 1 : 0, receipt.users.admin]);
      receipt.cases[c.key] = row.insertId;
      await db.execute('INSERT INTO case_attorney (cf_code,attorney_id,role_on_case,assigned_date) VALUES (?,?,?,?)',
        [row.insertId, plan.attorneys[c.primaryAttorney].id, 'Lead Counsel', c.created]);
      await db.execute('INSERT INTO client_case (client_id,cf_code,client_role) VALUES (?,?,?)', [receipt.clients[plan.clients[c.client].key], row.insertId, 'Demo Client']);
    }
    await db.execute('INSERT INTO case_attorney (cf_code,attorney_id,role_on_case,assigned_date) VALUES (?,?,?,?)',
      [receipt.cases['case-3'], plan.attorneys[1].id, 'Co-Counsel', plan.date]);
    await db.execute('INSERT INTO client_case (client_id,cf_code,client_role) VALUES (?,?,?)', [receipt.clients['client-1'], receipt.cases['case-3'], 'Co-Applicant']);
    for (const [i, index] of [0, 1, 2, 3, 4, 6, 7, 8].entries()) {
      await db.execute(`INSERT INTO hearing_schedule (cf_code,hearing_date,venue,hearing_type,status_id,remarks,created_by)
        VALUES (?,?,?,?,?,?,?)`, [receipt.cases[plan.cases[index].key], `${dateOffset(plan.date, 14 + i)} ${i === 0 ? '09' : '10'}:00:00`, 'Demo Training Court',
        ['Pre-Trial Conference', 'Document Review', 'Status Conference'][i % 3], 1, 'Fictional hearing; verify official notices separately.', receipt.users.admin]);
    }
    for (const doc of plan.documents) {
      const c = plan.cases.find(c => c.key === doc.caseKey), last = doc.versions.at(-1);
      const [row] = await db.execute(`INSERT INTO document (cf_code,doc_name,file_type,file_path,status_id,current_version_no,uploaded_by,date_added)
        VALUES (?,?,?,?,1,?,?,?)`, [receipt.cases[c.key], doc.title, last.mime, paths[last.file], last.number, receipt.users.admin, c.created]);
      receipt.documents[doc.key] = row.insertId;
      for (const v of doc.versions) await db.execute(`INSERT INTO document_version
        (document_code,version_no,file_name,file_path,file_size,mime_type,extracted_text,uploaded_by,ocr_status,uploaded_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [row.insertId, v.number, path.basename(v.file), paths[v.file], v.size, v.mime, v.extractedText, receipt.users.admin,
          v.ocrStatus, `${c.created} 10:00:00`]);
    }
    await db.execute('UPDATE demo_dataset SET receipt_json=? WHERE dataset_key=?', [JSON.stringify(receipt), VERSION]);
    await fs.rename(stage, dest); published = true; stage = null;
    commitAttempted = true;
    await db.commit();
    return { ...(await verifyInstall(db, bundle, root)), alreadyInstalled: false };
  } catch (error) {
    try { await db.rollback(); } catch {}
    if (published && !commitAttempted) await fs.rm(dest, { recursive: true, force: true });
    // On an ambiguous commit failure retain files: deleting possibly committed data
    // would break the archive. Inspect the receipt before retrying/repairing.
    throw error;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await db.execute('SELECT RELEASE_LOCK(?)', [`pacfas-demo:${database}`]);
  }
}
module.exports = { assertTarget, schemaForDemo, loadBundle, receiptFor, verifyInstall, install, ROOT };
