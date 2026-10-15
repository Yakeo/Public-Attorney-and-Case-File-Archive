// js/api.js - MOCK VERSION FOR OFFLINE FRONTEND TESTING

const MOCK_ATTORNEYS = [
  { id: 1, full_name: "Clara Vance", specialization: "Corporate", bio: "Senior partner specializing in corporate compliance, mergers, and business contracts.", email: "clara.vance@pacfas.gov", bar_number: "BAR-2018-9921" },
  { id: 2, full_name: "Marcus Reyes", specialization: "Criminal", bio: "Defense attorney with 12+ years of litigation experience in defense cases.", email: "m.reyes@pacfas.gov", bar_number: "BAR-2014-4412" },
  { id: 3, full_name: "Elena Rostova", specialization: "Civil", bio: "Focused on property disputes, civil claims, and dispute resolution.", email: "elena@pacfas.gov", bar_number: "BAR-2021-1055" }
];

const MOCK_CASES = [
  { id: 101, case_number: "CV-2026-0042", title: "Apex Corp vs. Nexus Ltd", client_name: "Apex Corp", status: "Active", created_at: "2026-03-12", document_count: 5, description: "Contractual dispute regarding enterprise software licensing rights." },
  { id: 102, case_number: "CR-2026-0118", title: "People vs. Harrison", client_name: "David Harrison", status: "Pending", created_at: "2026-05-19", document_count: 2, description: "Alleged financial compliance violation under regional review." },
  { id: 103, case_number: "CV-2025-0899", title: "Estate of De La Cruz", client_name: "Maria De La Cruz", status: "Closed", created_at: "2025-11-04", document_count: 11, description: "Estate settlement and probate filing." }
];

async function apiRequest(endpoint, method = 'GET', body = null) {
  console.log(`[MOCK API Call] ${method} ${endpoint}`, body);

  // Simulate light network latency
  await new Promise(resolve => setTimeout(resolve, 150));

  // Mock Login
  if (endpoint.includes('/auth/login')) {
    return { token: 'mock-jwt-token-xyz123', user: { full_name: 'Clara Vance', email: body.email || 'clara.vance@pacfas.gov' } };
  }

  // Mock Current User
  if (endpoint.includes('/auth/me')) {
    return { data: { full_name: 'Clara Vance', email: 'clara.vance@pacfas.gov' } };
  }

  // Mock Attorney Directory & Profiles
  if (endpoint.includes('/users')) {
    if (endpoint.includes('/users/1') || endpoint.includes('/users/2') || endpoint.includes('/users/3')) {
      const id = parseInt(endpoint.split('/').pop()) || 1;
      const found = MOCK_ATTORNEYS.find(a => a.id === id) || MOCK_ATTORNEYS[0];
      return { data: found };
    }
    return { data: MOCK_ATTORNEYS };
  }

  // Mock Single Case Details
  if (endpoint.includes('/cases/')) {
    const caseId = parseInt(endpoint.split('/').pop());
    const foundCase = MOCK_CASES.find(c => c.id === caseId) || MOCK_CASES[0];
    return { data: foundCase };
  }

  // Mock Cases List
  if (endpoint.includes('/cases')) {
    return { data: MOCK_CASES };
  }

  // Mock Documents & Hearings
  if (endpoint.includes('/documents')) {
    return { data: [{ id: 1, title: "Initial Complaint Brief.pdf", filename: "brief.pdf", ocr_text: "STATE OF PUBLIC RECORD\nCASE CV-2026-0042\nPlaintiff: Apex Corp\nDefendant: Nexus Ltd" }] };
  }

  if (endpoint.includes('/hearings')) {
    return { data: [{ scheduled_date: new Date().toISOString(), location: "Courtroom 3B", notes: "Pre-trial conference and motion hearing." }] };
  }

  // Fallback
  return { data: [] };
}