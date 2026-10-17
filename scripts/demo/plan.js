const VERSION = 'defense-v1';
const DEMO_PASSWORD = 'Defense-Demo-7426!'; // Intentionally public synthetic logins. Never production.
const attorneys = [
  ['Tala', 'Demo', 4], ['Mateo', 'Demo', 6], ['Iris', 'Demo', 5],
  ['Nico', 'Demo', 10], ['Lila', 'Demo', 2]
];
const topics = [
  ['Riverside Boundary Review', 6], ['Harbor Employment Claim', 5], ['Meadow Family Support', 4],
  ['Cedar Lease Clarification', 6], ['Orion Partnership Records', 3], ['Lakeside Access Review', 1],
  ['Market Stall Agreement', 1], ['Workshop Wage Reconciliation', 5], ['Willow Guardianship Inquiry', 4],
  ['Birch Property Inventory', 6], ['Northwind Business Filing', 3], ['Community Records Request', 10],
  ['Transit Incident Review', 2], ['Studio Copyright Inquiry', 8], ['Garden Permit Review', 11],
  ['Learning Center Tax Records', 7], ['Public Training Summary A', 1], ['Public Training Summary B', 10]
];
const pad = n => String(n).padStart(2, '0');
function dateOffset(date, days) {
  return new Date(new Date(date + 'T12:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
}
function createPlan(date = '2026-10-17') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || dateOffset(date, 0) !== date) {
    throw new Error('Use a valid --date YYYY-MM-DD.');
  }
  const accounts = [
    { key: 'admin', role: 1, username: 'Defense Demo Admin', email: 'demo.admin@example.test' },
    { key: 'staff', role: 3, username: 'Defense Demo Staff', email: 'demo.staff@example.test' },
    { key: 'public', role: 5, username: 'Defense Demo Public', email: 'demo.public@example.test' },
    ...attorneys.map(([fname, lname], i) => ({ key: `attorney-${i + 1}`, role: 2,
      username: `${fname.toLowerCase()}.demo`, email: `${fname.toLowerCase()}.demo@example.test` }))
  ];
  const clients = topics.map((_, i) => ({ key: `client-${i + 1}`, fname: ['Amihan', 'Bayan', 'Dalisay', 'Hiraya', 'Mayumi', 'Sinag'][i % 6],
    lname: `Sample${pad(i + 1)}`, email: `client${pad(i + 1)}@example.test`, birthDate: `${1980 + i}-05-12` }));
  const cases = topics.map(([topic, category], i) => ({ key: `case-${i + 1}`, ref: `DEMO-${pad(i + 1)}`,
    title: `DEMO-${pad(i + 1)} - ${topic}`, topic, category, primaryAttorney: i % 5,
    client: i, status: i < 10 ? 1 : i < 14 ? 2 : i < 17 ? 3 : 4,
    priority: (i % 4) + 1, created: dateOffset(date, -6 - i * 3),
    filing: dateOffset(date, -8 - i * 3), public: i >= 16,
    marker: i === 0 ? 'ORCHID' : `TRAINING${pad(i + 1)}` }));
  return { version: VERSION, date, accounts, clients, attorneys: attorneys.map(([fname, lname, specialization], i) => ({
    id: `D${String(i + 1).padStart(4, '0')}`, account: `attorney-${i + 1}`, fname, lname, specialization,
    bar: `DEMO-BAR-${pad(i + 1)}`
  })), cases };
}
const kinds = ['Intake Summary', 'Fictional Supporting Statement', 'Evidence Inventory', 'Hearing Preparation Notes', 'Case Progress Report'];
function documentContent(plan, c, kind, revision = 1) {
  const client = plan.clients[c.client], counsel = plan.attorneys[c.primaryAttorney];
  const specific = [
    `The fictional client asks the training office to review ${c.topic.toLowerCase()}. The purpose of this intake is to identify the records needed, not to establish liability or predict an outcome. Staff should confirm the scope of the request and explain what information remains unverified.`,
    `For this fictional exercise, the client describes an initial discussion, an exchange of records, and a later request for clarification. The statement separates what the speaker observed from what other people reported. Dates and names here are training details, not sworn testimony.`,
    `Item A is the fictional intake note. Item B is a sample correspondence record. Item C is an invented chronology prepared for this case. The custodian should compare labels, check completeness, and record any missing pages before relying on these items. No item is authenticated evidence.`,
    `Before a hearing, review the request, confirm the venue and time, compare the calendar for all assigned counsel, and organize copies of the supporting records. Prepare questions about unresolved facts. This checklist does not replace a court notice or an attorney's legal judgment.`,
    `The current training file has an intake, a supporting statement, an inventory, and preparation notes. The next action is to check consistency across those records and obtain any missing information. A status label indicates workflow only; it is not a legal ruling.`
  ][kind];
  const paragraphs = [
    'SYNTHETIC DEMO DATA - NOT A REAL LEGAL RECORD',
    `${c.ref}: ${c.topic}. Search marker: ${c.marker}.`,
    `Document: ${kinds[kind]}. Revision ${revision}. Recorded ${dateOffset(c.created, kind)}.`,
    `Fictional client: ${client.fname} ${client.lname}. Assigned counsel: ${counsel.fname} ${counsel.lname}.`,
    specific,
    `Training timeline: the file was registered on ${c.created}, following a fictional filing date of ${c.filing}. Each record belongs to ${c.ref}; identifiers should be checked before any upload or download.`,
    revision > 1 ? 'REVISIONTWO: This revised training copy adds a corrected inventory reference and an explicit next-action checklist. It supersedes the earlier sample for demonstration only.' : 'INITIALCOPY: This is the original demonstration copy. Later revisions, if present, should remain distinguishable from this version.',
    'Review checklist: confirm the case reference; check the client link; review counsel assignments; compare the original document with extracted text; and report any missing or inaccurate content.',
    'These pages are software demonstration material, not legal forms, legal advice, court orders, or genuine evidence. All people, events, bar references, and case descriptions are fictional.'
  ];
  return { title: `${c.ref} - ${kinds[kind]}`, paragraphs };
}
module.exports = { VERSION, DEMO_PASSWORD, createPlan, documentContent, dateOffset, kinds };
