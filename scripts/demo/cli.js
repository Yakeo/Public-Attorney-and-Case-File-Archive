#!/usr/bin/env node
const path = require('node:path');
const { assertTarget, install, verifyInstall, ROOT } = require('./install');

function parseArgs(args) {
  const [command, ...rest] = args;
  if (!['build', 'seed', 'verify', 'start'].includes(command)) throw new Error('Usage: demo:<build|seed|verify|start> -- [options]');
  const options = { command };
  const allowed = command === 'build' ? ['out', 'date', 'language-data'] : ['database', 'bundle'];
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--confirm-demo' && command !== 'build') { options.confirmed = true; continue; }
    const key = flag.slice(2);
    if (!flag.startsWith('--') || !allowed.includes(key) || !rest[i + 1] || rest[i + 1].startsWith('--') || options[key] !== undefined) {
      throw new Error(`Unknown, repeated or incomplete option: ${flag}`);
    }
    options[key] = rest[++i];
  }
  if (command !== 'build') assertTarget(options.database, options.confirmed);
  return options;
}
function connectionOptions(env) {
  return { host: env.DB_HOST || 'localhost', user: env.DB_USER || 'root', password: env.DB_PASSWORD || '',
    port: Number(env.DB_PORT || 3306), ...(env.DB_SOCKET ? { socketPath: env.DB_SOCKET } : {}), multipleStatements: true };
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  require('dotenv').config({ quiet: true });
  if (options.command === 'build') {
    const { buildBundle } = require('./files');
    const built = await buildBundle(path.resolve(ROOT, options.out || 'demo-data/defense-v1'), {
      date: options.date || new Date().toISOString().slice(0, 10), languageData: options['language-data']
    });
    console.log(`Built actual documents and verified extraction: ${JSON.stringify(built.manifest.counts)}\nZIP: ${built.zip}`);
    return;
  }
  if (options.command === 'start' && !process.env.JWT_SECRET) throw new Error('Set a strong JWT_SECRET in your local .env before starting the demo.');
  const bundle = path.resolve(ROOT, options.bundle || 'demo-data/defense-v1');
  // DB_NAME is deliberately ignored. Only an explicitly confirmed *_demo target is used.
  const db = await require('mysql2/promise').createConnection(connectionOptions(process.env));
  try {
    if (options.command === 'seed') await db.query(`CREATE DATABASE IF NOT EXISTS \`${options.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await db.query(`USE \`${options.database}\``);
    const result = options.command === 'seed'
      ? await install(db, options.database, bundle)
      : await verifyInstall(db, bundle);
    console.log(`${result.alreadyInstalled ? 'Already installed; no case/document records duplicated.' : 'Demo dataset verified.'} ${JSON.stringify(result.counts)}`);
    if (result.publicSummariesAdded) console.log(`Added ${result.publicSummariesAdded} approved synthetic public summaries and private PDFs.`);
    if (options.command === 'seed') console.log('Read demo-data/defense-v1/START-HERE.txt for demo logins and the walkthrough.');
  } finally { await db.end(); }
  if (options.command === 'start') {
    process.env.DB_NAME = options.database;
    process.env.TESSDATA_PATH = path.join(bundle, 'language-data');
    console.log(`Starting isolated demo app with DB_NAME=${options.database}. Your .env file is not changed.`);
    require('../../server');
  }
}
if (require.main === module) main().catch(error => { console.error(`Demo: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, connectionOptions, main };
