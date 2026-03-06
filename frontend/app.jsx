const { useEffect, useMemo, useState } = React;

const ROLE_CONFIGS = {
  admin: {
    label: 'Admin',
    basePath: '/admin',
    defaultRoute: 'dashboard',
    nav: [
      { id: 'dashboard', label: 'Dashboard', to: '/admin/dashboard' },
      { id: 'memorials', label: 'Memorials', to: '/admin/memorials' },
      { id: 'scheduling', label: 'Scheduling', to: '/admin/scheduling' },
      { id: 'users', label: 'Users', to: '/admin/users' },
      { id: 'customers', label: 'Customers', to: '/admin/customers' },
      { id: 'cemeteries', label: 'Cemeteries', to: '/admin/cemeteries' },
      { id: 'archive', label: 'Photos & Archive', to: '/admin/archive' },
      { id: 'reports', label: 'Reports', to: '/admin/reports' },
      { id: 'settings', label: 'Settings', to: '/admin/settings' }
    ]
  },
  employee: {
    label: 'Employee',
    basePath: '/employee',
    defaultRoute: 'dashboard',
    nav: [
      { id: 'dashboard', label: 'Dashboard', to: '/employee/dashboard' },
      { id: 'scheduling', label: 'My Schedule', to: '/employee/scheduling' },
      { id: 'memorials', label: 'Memorials', to: '/employee/memorials' },
      { id: 'archive', label: 'Photos & Archive', to: '/employee/archive' },
      { id: 'reports', label: 'Reports', to: '/employee/reports' }
    ]
  },
  customer: {
    label: 'Customer',
    basePath: '/customer',
    defaultRoute: 'dashboard',
    nav: [
      { id: 'dashboard', label: 'Overview', to: '/customer/dashboard' },
      { id: 'memorials', label: 'My Memorials', to: '/customer/memorials' },
      { id: 'archive', label: 'Photos', to: '/customer/archive' },
      { id: 'settings', label: 'Settings', to: '/customer/settings' }
    ]
  }
};

const TEST_VIEW_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'employee', label: 'Employee' },
  { value: 'customer', label: 'Customer' },
  { value: 'login', label: 'Login Screen' }
];

const ROUTES = {
  admin: {
    dashboard: DashboardPage,
    memorials: MemorialsPage,
    memorialdetail: MemorialDetailPage,
    scheduling: SchedulingPage,
    users: UsersAdminPage,
    customers: CustomersPage,
    customerdetail: CustomerDetailPage,
    cemeteries: CemeteriesPage,
    archive: ArchivePage,
    reports: ReportsPage,
    settings: SettingsPage,
    onboarding: OnboardingPage
  },
  employee: {
    dashboard: EmployeeDashboardPage,
    scheduling: EmployeeSchedulingPage,
    memorials: MemorialsPage,
    memorialdetail: MemorialDetailPage,
    archive: ArchivePage,
    reports: ReportsPage
  },
  customer: {
    dashboard: CustomerDashboardPage,
    memorials: CustomerMemorialsPage,
    archive: ArchivePage,
    settings: CustomerSettingsPage
  }
};

const SEARCH_CONTENT = {
  admin: [
    {
      title: 'New Service Onboarding',
      description: 'Create a new customer and memorial',
      to: '/admin/onboarding',
      keywords: 'new service onboarding add customer memorial'
    },
    {
      title: 'Smith Family Headstone',
      description: 'Memorial record in Greenwood Cemetery',
      to: '/admin/memorials',
      keywords: 'memorial smith greenwood maintained'
    },
    {
      title: 'Sarah Johnson',
      description: 'Customer profile',
      to: '/admin/customers',
      keywords: 'customer sarah johnson annual maintenance'
    },
    {
      title: 'Greenwood Cemetery',
      description: 'Cemetery service location',
      to: '/admin/cemeteries',
      keywords: 'cemetery location memorials services'
    },
    {
      title: 'User Management',
      description: 'Create and edit employee access',
      to: '/admin/users',
      keywords: 'users create employee edit team phone full-time part-time'
    }
  ],
  employee: [
    {
      title: 'Task Queue',
      description: 'Photo uploads and maintenance checks',
      to: '/employee/dashboard',
      keywords: 'tasks uploads maintenance checks crew'
    },
    {
      title: 'Crew Schedule',
      description: 'Daily route and assignments',
      to: '/employee/scheduling',
      keywords: 'schedule route assignments crew'
    }
  ],
  customer: [
    {
      title: 'Service Status',
      description: 'Plan progress and upcoming visit',
      to: '/customer/dashboard',
      keywords: 'service status progress upcoming visit'
    },
    {
      title: 'My Memorials',
      description: 'Your active memorial records',
      to: '/customer/memorials',
      keywords: 'my memorials active records'
    },
    {
      title: 'Notification Preferences',
      description: 'Email and phone settings',
      to: '/customer/settings',
      keywords: 'notifications email phone settings'
    }
  ]
};

const CUSTOMER_ACCOUNTS_KEY = 'hs_customer_accounts';
const EMPLOYEE_ACCOUNTS_KEY = 'hs_employee_accounts';
const CUSTOMER_SESSION_KEY = 'hs_customer_session';
const TEMP_PASSWORD_QUEUE_KEY = 'hs_temp_password_queue';
const JOB_RECORDS_KEY = 'hs_job_records';

const DEFAULT_ADMIN_CUSTOMERS = [
  {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    memorials: 2,
    activePlan: 'Annual Maintenance',
    lastContact: '09/15/23',
    serviceType: 'Headstone Cleaning',
    serviceLocation: 'Greenwood Cemetery',
    lastService: '09/12/23',
    nextService: '10/12/23',
    subscriptionStatus: 'Active',
    subscriptionRenewal: '12/01/23',
    createdAtLabel: '04/10/23',
    lifetimeValue: '$2,160.00',
    annualCare: 'Semi-Annual Care',
    customerNotes: 'Family prefers Friday morning updates by text after service completion.',
    hasPortalAccess: false,
    memorialDetails: [
      {
        id: 'sarah-1',
        memorial: 'Smith Family Headstone',
        cemetery: 'Greenwood Cemetery',
        subStatus: 'Scheduled',
        plan: 'Annual Maintenance',
        nextService: '10/12/23',
        lastService: '09/12/23',
        serviceInfo: 'Biannual wash, trim, and detail.',
        photoStatus: 'Before/after approved'
      },
      {
        id: 'sarah-2',
        memorial: 'Johnson Memorial Bench',
        cemetery: 'Greenwood Cemetery',
        subStatus: 'Quote Sent',
        plan: 'Initial Restoration',
        nextService: 'Pending approval',
        lastService: 'Not started',
        serviceInfo: 'Stone reset and inscription clean-up.',
        photoStatus: 'Before photos uploaded'
      }
    ]
  }
];

const DEFAULT_MEMORIAL_RECORDS = [
  {
    id: 'm-1001',
    memorial: 'Smith Family Headstone',
    customer: 'Sarah Johnson',
    cemetery: 'Greenwood Cemetery',
    plan: 'Annual Maintenance',
    lastService: '09/12/23',
    nextService: '10/12/23',
    subStatus: 'Scheduled',
    serviceInfo: 'Biannual wash, trim, and detail.',
    photoStatus: 'Ready for review',
    team: 'Northern Utah',
    technician: 'Spencer'
  },
  {
    id: 'm-1002',
    memorial: 'Jones Memorial',
    customer: 'Michael Jones',
    cemetery: 'Oakwood Memorial Park',
    plan: 'Initial Restoration',
    lastService: '08/18/23',
    nextService: '10/05/23',
    subStatus: 'Pre-Work Forms Sent',
    serviceInfo: 'Deep clean and crack seal.',
    photoStatus: 'Before photos on file',
    team: 'Southern Utah',
    technician: 'Avery'
  },
  {
    id: 'm-1003',
    memorial: 'Thompson Headstone',
    customer: 'Lydia Thompson',
    cemetery: 'Hillcrest Cemetery',
    plan: 'Quarterly Care',
    lastService: '09/03/23',
    nextService: '11/03/23',
    subStatus: 'On Track',
    serviceInfo: 'Quarterly wash and inspection.',
    photoStatus: 'No new photos required',
    team: 'Northern Utah',
    technician: 'Jade'
  },
  {
    id: 'm-1004',
    memorial: 'Carter Memorial',
    customer: 'Daniel Carter',
    cemetery: 'Rolling Hills',
    plan: 'Annual Maintenance',
    lastService: '09/23/23',
    nextService: '12/23/23',
    subStatus: 'Completed',
    serviceInfo: 'Repair complete, annual follow-up.',
    photoStatus: 'After photos pending review',
    team: 'Southern Utah',
    technician: 'Spencer'
  }
];

const MONTHLY_REVENUE_SERIES = [
  { month: 'Jan', scheduled: 7400, collected: 6900 },
  { month: 'Feb', scheduled: 7800, collected: 7300 },
  { month: 'Mar', scheduled: 8100, collected: 7600 },
  { month: 'Apr', scheduled: 8600, collected: 8000 },
  { month: 'May', scheduled: 9000, collected: 8450 }
];

const DEFAULT_SCHEDULE_ENTRIES = [
  {
    id: 'svc-1',
    time: '9:00 AM',
    memorial: 'Smith Family Headstone',
    customer: 'Sarah Johnson',
    cemetery: 'Greenwood Cemetery',
    team: 'Northern Utah',
    tech: 'Spencer',
    customerNotes: 'Please text photo update after completion.',
    leadershipNotes: 'Confirm inscription clarity before departure.'
  },
  {
    id: 'svc-2',
    time: '10:30 AM',
    memorial: 'Jones Memorial',
    customer: 'Michael Jones',
    cemetery: 'Oakwood Memorial Park',
    team: 'Southern Utah',
    tech: 'Avery',
    customerNotes: 'Gate access code provided by cemetery office.',
    leadershipNotes: 'Capture close-up of crack repair zone.'
  },
  {
    id: 'svc-3',
    time: '11:00 AM',
    memorial: 'Thompson Headstone',
    customer: 'Lydia Thompson',
    cemetery: 'Hillcrest Cemetery',
    team: 'Northern Utah',
    tech: 'Jade',
    customerNotes: 'Customer wants before/after side-by-side.',
    leadershipNotes: 'Verify sealant cure time before photos.'
  }
];

const DEFAULT_JOB_RECORDS = [
  {
    id: 'job-1001',
    memorialId: 'm-1001',
    memorial: 'Smith Family Headstone',
    customer: 'Sarah Johnson',
    cemetery: 'Greenwood Cemetery',
    status: 'Completed',
    createdAt: '2023-09-12T17:00:00.000Z',
    completedAt: '2023-09-12T18:30:00.000Z',
    nextService: '10/12/23',
    team: 'Northern Utah',
    technician: 'Spencer',
    customerNotes: 'Customer requested before/after update by text.',
    leadershipNotes: 'Inscription quality check complete.',
    photoFiles: ['smith-before.jpg', 'smith-after.jpg'],
    documentFiles: ['invoice-1001.pdf']
  },
  {
    id: 'job-1002',
    memorialId: 'm-1002',
    memorial: 'Jones Memorial',
    customer: 'Michael Jones',
    cemetery: 'Oakwood Memorial Park',
    status: 'Pre-Work Forms Sent',
    createdAt: '2023-09-02T18:00:00.000Z',
    completedAt: '',
    nextService: '10/05/23',
    team: 'Southern Utah',
    technician: 'Avery',
    customerNotes: 'Waiver and permission form sent for signature.',
    leadershipNotes: 'Track return of signed documents before dispatch.',
    photoFiles: ['jones-intake-1.jpg'],
    documentFiles: ['jones-waiver.pdf']
  }
];

function createDefaultMemorialDetail({ customerName, serviceType, cemetery }) {
  return {
    id: `${(customerName || 'new').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-1`,
    memorial: `${customerName || 'New Customer'} Memorial`,
    cemetery: cemetery || 'Pending Assignment',
    subStatus: 'Intake',
    plan: serviceType || 'Initial Restoration',
    nextService: 'To Be Scheduled',
    lastService: 'Not Started',
    serviceInfo: 'Quote drafted and pending approval.',
    photoStatus: 'No photos uploaded'
  };
}

function formatDisplayDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString();
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function memorialLookupKey(record) {
  return [
    normalizeText(record.memorial),
    normalizeText(record.customer),
    normalizeText(record.cemetery)
  ].join('|');
}

function buildAdminCustomers(accounts) {
  const customersByEmail = new Map();

  DEFAULT_ADMIN_CUSTOMERS.forEach((customer) => {
    const email = normalizeEmail(customer.email);
    const memorialDetails = Array.isArray(customer.memorialDetails) && customer.memorialDetails.length > 0
      ? customer.memorialDetails
      : [createDefaultMemorialDetail({
        customerName: customer.name,
        serviceType: customer.activePlan,
        cemetery: customer.serviceLocation
      })];

    customersByEmail.set(email, {
      ...customer,
      memorialDetails,
      memorials: memorialDetails.length,
      email
    });
  });

  (accounts || []).forEach((account) => {
    const email = normalizeEmail(account.email);
    if (!email) return;

    const existing = customersByEmail.get(email) || {};
    const createdAtLabel = formatDisplayDate(account.createdAt, existing.createdAtLabel || 'New');
    const lastContact = formatDisplayDate(
      account.updatedAt || account.createdAt,
      existing.lastContact || createdAtLabel
    );
    const serviceType = account.serviceType || existing.serviceType || 'Initial Restoration';
    const memorialDetails = Array.isArray(account.memorialDetails) && account.memorialDetails.length > 0
      ? account.memorialDetails
      : (Array.isArray(existing.memorialDetails) && existing.memorialDetails.length > 0
        ? existing.memorialDetails
        : [createDefaultMemorialDetail({
          customerName: account.name || existing.name,
          serviceType,
          cemetery: account.cemetery || existing.serviceLocation
        })]);
    const hasPortalAccess = account.hasPortalAccess ?? existing.hasPortalAccess ?? true;
    const mustResetPassword = Boolean(account.mustResetPassword);

    customersByEmail.set(email, {
      email,
      name: account.name || existing.name || email,
      memorials: memorialDetails.length,
      activePlan: memorialDetails[0]?.plan || account.serviceType || existing.activePlan || 'Initial Restoration',
      lastContact,
      serviceType,
      serviceLocation: memorialDetails[0]?.cemetery || existing.serviceLocation || 'Pending Assignment',
      lastService: memorialDetails[0]?.lastService || existing.lastService || 'Not Started',
      nextService: memorialDetails[0]?.nextService || existing.nextService || 'To Be Scheduled',
      subscriptionStatus: hasPortalAccess
        ? (mustResetPassword ? 'Pending Activation' : existing.subscriptionStatus || 'Active')
        : 'No Portal Access',
      subscriptionRenewal: existing.subscriptionRenewal || createdAtLabel,
      createdAtLabel,
      mustResetPassword,
      hasPortalAccess,
      lifetimeValue: existing.lifetimeValue || '$0.00',
      annualCare: existing.annualCare || 'Not enrolled',
      customerNotes: account.customerNotes || existing.customerNotes || 'No notes recorded yet.',
      memorialDetails
    });
  });

  return Array.from(customersByEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildMemorialRecords(customers, jobRecords) {
  const recordsById = new Map();
  const keyToId = new Map();

  function addOrMerge(record) {
    const id = record.id || memorialLookupKey(record);
    const key = memorialLookupKey(record);
    const existingId = keyToId.get(key);
    const targetId = existingId || id;
    const existing = recordsById.get(targetId) || {};

    recordsById.set(targetId, {
      ...existing,
      ...record,
      id: targetId
    });
    keyToId.set(key, targetId);
    return targetId;
  }

  DEFAULT_MEMORIAL_RECORDS.forEach((record) => addOrMerge(record));

  (customers || []).forEach((customer) => {
    const details = Array.isArray(customer.memorialDetails) ? customer.memorialDetails : [];
    details.forEach((detail, index) => {
      addOrMerge({
        id: detail.id || `${normalizeEmail(customer.email)}-${index + 1}`,
        memorial: detail.memorial || `${customer.name} Memorial`,
        customer: customer.name,
        cemetery: detail.cemetery || customer.serviceLocation || 'Pending Assignment',
        plan: detail.plan || customer.activePlan || 'Initial Restoration',
        lastService: detail.lastService || customer.lastService || 'Not Started',
        nextService: detail.nextService || customer.nextService || 'To Be Scheduled',
        subStatus: detail.subStatus || 'Intake',
        serviceInfo: detail.serviceInfo || customer.serviceType || 'Pending service scope',
        photoStatus: detail.photoStatus || 'No photos uploaded',
        team: detail.team || 'Unassigned',
        technician: detail.technician || detail.tech || 'Unassigned'
      });
    });
  });

  (jobRecords || []).forEach((job) => {
    const recordId = job.memorialId || memorialLookupKey(job);
    const existing = recordsById.get(recordId);
    const key = memorialLookupKey(job);
    const fallbackId = keyToId.get(key) || recordId;
    const targetId = existing ? recordId : fallbackId;
    const current = recordsById.get(targetId) || {};

    addOrMerge({
      ...current,
      id: targetId,
      memorial: job.memorial || current.memorial || 'Untitled Memorial',
      customer: job.customer || current.customer || 'Unknown Customer',
      cemetery: job.cemetery || current.cemetery || 'Pending Assignment',
      subStatus: job.status || current.subStatus || 'Intake',
      nextService: job.nextService || current.nextService || 'To Be Scheduled',
      lastService: formatDisplayDate(
        job.completedAt || job.createdAt,
        current.lastService || 'Not Started'
      ),
      team: job.team || current.team || 'Unassigned',
      technician: job.technician || current.technician || 'Unassigned',
      photoStatus: Array.isArray(job.photoFiles) && job.photoFiles.length > 0
        ? `${job.photoFiles.length} photo file(s)`
        : current.photoStatus || 'No photos uploaded'
    });
  });

  return Array.from(recordsById.values()).sort((a, b) => a.memorial.localeCompare(b.memorial));
}

function getRoleSearchIndex(role) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.admin;
  const navEntries = config.nav.map((item) => ({
    title: item.label,
    description: `${config.label} view`,
    to: item.to,
    keywords: `${item.label} ${item.id}`
  }));

  return [...navEntries, ...(SEARCH_CONTENT[role] || [])];
}

function getSearchResults(role, query) {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return [];

  const deduped = new Map();
  getRoleSearchIndex(role).forEach((entry) => {
    const key = `${entry.to}|${entry.title}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  });

  return Array.from(deduped.values())
    .map((entry) => {
      const title = entry.title.toLowerCase();
      const description = (entry.description || '').toLowerCase();
      const keywords = (entry.keywords || '').toLowerCase();
      const haystack = `${title} ${description} ${keywords}`;

      if (!haystack.includes(needle)) {
        return null;
      }

      let score = 0;
      if (title.startsWith(needle)) score += 6;
      if (title.includes(needle)) score += 3;
      if (description.includes(needle)) score += 2;
      if (keywords.includes(needle)) score += 1;

      return { ...entry, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 8);
}

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

function loadCustomerAccounts() {
  try {
    const raw = localStorage.getItem(CUSTOMER_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveCustomerAccounts(accounts) {
  try {
    localStorage.setItem(CUSTOMER_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (err) {
    // ignore storage errors
  }
}

function loadEmployeeAccounts() {
  try {
    const raw = localStorage.getItem(EMPLOYEE_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveEmployeeAccounts(accounts) {
  try {
    localStorage.setItem(EMPLOYEE_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (err) {
    // ignore storage errors
  }
}

function loadJobRecords() {
  try {
    const raw = localStorage.getItem(JOB_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_JOB_RECORDS;
    }
    return parsed;
  } catch (err) {
    return DEFAULT_JOB_RECORDS;
  }
}

function saveJobRecords(records) {
  try {
    localStorage.setItem(JOB_RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    // ignore storage errors
  }
}

function loadCustomerSession() {
  try {
    return localStorage.getItem(CUSTOMER_SESSION_KEY) || '';
  } catch (err) {
    return '';
  }
}

function storeCustomerSession(email) {
  try {
    if (email) {
      localStorage.setItem(CUSTOMER_SESSION_KEY, email);
    } else {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
  } catch (err) {
    // ignore storage errors
  }
}

function queueTempPasswordEmail(payload) {
  try {
    const raw = localStorage.getItem(TEMP_PASSWORD_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    const nextQueue = Array.isArray(queue) ? queue : [];
    nextQueue.unshift({
      ...payload,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(TEMP_PASSWORD_QUEUE_KEY, JSON.stringify(nextQueue.slice(0, 50)));
  } catch (err) {
    // ignore storage errors
  }
}

function generateTempPassword() {
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `HS-${code}${suffix}`;
}

function getStoredRole() {
  try {
    const stored = localStorage.getItem('hs_role');
    if (stored && ROLE_CONFIGS[stored]) {
      return stored;
    }
  } catch (err) {
    // ignore storage errors
  }
  return 'admin';
}

function storeRole(role) {
  try {
    localStorage.setItem('hs_role', role);
  } catch (err) {
    // ignore storage errors
  }
}

function normalizePath(value) {
  if (!value) return '';
  let path = value;
  if (path.startsWith('#')) {
    path = path.slice(1);
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  return path;
}

function getCurrentHashPath() {
  return normalizePath(window.location.hash || '');
}

function useHashPath() {
  const [path, setPath] = useState(getCurrentHashPath);

  useEffect(() => {
    function handleHashChange() {
      setPath(getCurrentHashPath());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(nextPath) {
    const normalized = normalizePath(nextPath);
    if (!normalized) return;
    const current = getCurrentHashPath();
    if (current !== normalized) {
      window.location.hash = normalized;
    }
  }

  return [path, navigate];
}

function parseRoute(path) {
  const storedRole = getStoredRole();
  const normalized = normalizePath(path);
  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean);

  if (segments[0] === 'login') {
    const config = ROLE_CONFIGS[storedRole] || ROLE_CONFIGS.admin;
    return {
      role: storedRole,
      page: config.defaultRoute,
      config,
      canonicalPath: '/login',
      view: 'login'
    };
  }

  let role = segments[0] || storedRole;
  if (!ROLE_CONFIGS[role]) {
    role = storedRole;
  }

  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.admin;
  const routeMap = ROUTES[role] || ROUTES.admin;
  let page = segments[1] || config.defaultRoute;

  if (!routeMap[page]) {
    page = config.defaultRoute;
  }

  return {
    role,
    page,
    config,
    canonicalPath: `${config.basePath}/${page}`,
    view: 'app'
  };
}

function DashboardPage() {
  const maxRevenue = Math.max(
    ...MONTHLY_REVENUE_SERIES.map((entry) => Math.max(entry.scheduled, entry.collected))
  );

  const recentlyCompleted = [
    {
      memorial: 'Johnson Headstone',
      cemetery: 'Elmwood Cemetery',
      completedOn: '09/12/23',
      amount: '$180.00',
      photoStatus: 'Ready for review',
      invoiceStatus: 'Invoice draft'
    },
    {
      memorial: 'Carter Memorial',
      cemetery: 'Rolling Hills',
      completedOn: '09/23/23',
      amount: '$160.00',
      photoStatus: 'Approved',
      invoiceStatus: 'Sent'
    }
  ];

  const pipelineStages = [
    'Customer intake call',
    'Quote drafted and approved',
    'Pre-work forms and permissions',
    'Service scheduled',
    'Work performed and quality-checked',
    'Billing collected and closeout',
    'Annual care follow-up'
  ];

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Overview of revenue, pipeline progress, and scheduling health.</p>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Yearly Revenue Total</span>
          <strong>$141,240</strong>
          <small className="positive">+14% vs last year</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Monthly Revenue Change</span>
          <strong>+$8,450</strong>
          <small className="positive">+5.8% vs previous month</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Crews Active</span>
          <strong>5</strong>
          <small>Currently in field</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Data Quality Checks</span>
          <strong>97.6%</strong>
          <small>Required fields complete</small>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <button className="ghost-btn">View Calendar</button>
          </div>

          <ul className="service-list">
            <li>
              <strong>Smith Family Headstone</strong>
              <span>Greenwood Cemetery &middot; Sarah Johnson</span>
              <div className="meta">9:00 AM &middot; Northern Utah &middot; Spencer</div>
              <a className="inline-link" href="#/admin/customers">Open Customer</a>
            </li>
            <li>
              <strong>Jones Memorial</strong>
              <span>Oakwood Memorial Park &middot; Michael Jones</span>
              <div className="meta">10:30 AM &middot; Southern Utah &middot; Avery</div>
              <a className="inline-link" href="#/admin/customers">Open Customer</a>
            </li>
            <li>
              <strong>Thompson Headstone</strong>
              <span>Hillcrest Cemetery &middot; Lydia Thompson</span>
              <div className="meta">11:00 AM &middot; Northern Utah &middot; Jade</div>
              <a className="inline-link" href="#/admin/customers">Open Customer</a>
            </li>
          </ul>
        </div>

        <div className="card">
          <h3>Monthly Revenue</h3>
          <p className="meta">Scheduled vs collected revenue (best for CRM collections tracking)</p>
          <div className="revenue-chart">
            {MONTHLY_REVENUE_SERIES.map((entry) => (
              <div className="revenue-row" key={entry.month}>
                <span className="revenue-month">{entry.month}</span>
                <div className="revenue-bars">
                  <div
                    className="revenue-bar scheduled"
                    style={{ width: `${Math.round((entry.scheduled / maxRevenue) * 100)}%` }}
                  >
                    S ${entry.scheduled.toLocaleString()}
                  </div>
                  <div
                    className="revenue-bar collected"
                    style={{ width: `${Math.round((entry.collected / maxRevenue) * 100)}%` }}
                  >
                    C ${entry.collected.toLocaleString()}
                  </div>
                  <div className="revenue-delta-row">
                    <span className={`revenue-delta ${entry.collected >= entry.scheduled ? 'positive' : 'negative'}`}>
                      {entry.collected >= entry.scheduled ? 'Over target' : 'Gap'}: ${Math.abs(entry.collected - entry.scheduled).toLocaleString()}
                    </span>
                    <span className="revenue-rate">
                      Collection rate: {Math.round((entry.collected / entry.scheduled) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Recently Completed</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Memorial</th>
                  <th>Cemetery</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Photo Status</th>
                  <th>Billing</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentlyCompleted.map((record) => (
                  <tr key={record.memorial}>
                    <td>{record.memorial}</td>
                    <td>{record.cemetery}</td>
                    <td>{record.completedOn}</td>
                    <td>{record.amount}</td>
                    <td>{record.photoStatus}</td>
                    <td>{record.invoiceStatus}</td>
                    <td><button className="ghost-btn">Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Customer Journey Pipeline</h3>
          <p className="meta">Track every customer from first call to annual care.</p>
          <ul className="service-list">
            {pipelineStages.map((stage) => (
              <li key={stage}>
                <strong>{stage}</strong>
              </li>
            ))}
          </ul>
          <button className="primary-btn full">Open Billing &amp; Pipeline</button>
        </div>
      </section>
    </>
  );
}

function MemorialsPage({
  memorialRecords = DEFAULT_MEMORIAL_RECORDS,
  onOpenMemorial = () => {}
}) {
  const [query, setQuery] = useState('');

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memorialRecords;
    return memorialRecords.filter((record) => {
      const haystack = [
        record.memorial,
        record.customer,
        record.cemetery,
        record.plan,
        record.team,
        record.technician
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [memorialRecords, query]);

  return (
    <>
      <h1 className="page-title">Memorials</h1>
      <p className="page-subtitle">Permanent memorial records with service plan and next service date.</p>

      <div className="card memorial-filter-card">
        <label htmlFor="memorial-filter">Search Memorial Records</label>
        <input
          id="memorial-filter"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by memorial, customer, cemetery, team, or tech"
        />
        <p className="meta">Global search still lives in the top bar; this filters the memorial records table.</p>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Memorial</th>
                <th>Customer</th>
                <th>Cemetery</th>
                <th>Plan</th>
                <th>Last Service</th>
                <th>Next Service</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="7">No memorial records match this search.</td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{record.memorial}</td>
                    <td>{record.customer}</td>
                    <td>{record.cemetery}</td>
                    <td>{record.plan}</td>
                    <td>{record.lastService}</td>
                    <td>{record.nextService}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onOpenMemorial(record)}
                      >
                        Open Memorial
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SchedulingPage() {
  const [viewMode, setViewMode] = useState('week');
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [techFilter, setTechFilter] = useState('All Techs');

  const teams = useMemo(
    () => ['All Teams', ...Array.from(new Set(DEFAULT_SCHEDULE_ENTRIES.map((entry) => entry.team)))],
    []
  );
  const techs = useMemo(
    () => ['All Techs', ...Array.from(new Set(DEFAULT_SCHEDULE_ENTRIES.map((entry) => entry.tech)))],
    []
  );

  const filteredSchedule = useMemo(() => (
    DEFAULT_SCHEDULE_ENTRIES.filter((entry) => {
      if (teamFilter !== 'All Teams' && entry.team !== teamFilter) return false;
      if (techFilter !== 'All Techs' && entry.tech !== techFilter) return false;
      return true;
    })
  ), [teamFilter, techFilter]);

  return (
    <>
      <h1 className="page-title">Scheduling</h1>
      <p className="page-subtitle">Week, month, and day drill-through with team and technician filters.</p>

      <div className="card">
        <div className="card-header">
          <h3>Service Calendar</h3>
          <button className="ghost-btn">Flag Scheduling Issue</button>
        </div>
        <div className="toggle-group">
          {['day', 'week', 'month'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`toggle-btn${viewMode === mode ? ' active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <div className="filters-row">
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            {teams.map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
          <select value={techFilter} onChange={(event) => setTechFilter(event.target.value)}>
            {techs.map((tech) => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
        </div>

        <div className="calendar-placeholder">
          {viewMode[0].toUpperCase() + viewMode.slice(1)} view preview
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Memorial</th>
                <th>Team</th>
                <th>Tech</th>
                <th>Customer Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedule.length === 0 ? (
                <tr>
                  <td colSpan="5">No services match this filter.</td>
                </tr>
              ) : (
                filteredSchedule.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.time}</td>
                    <td>{entry.memorial}</td>
                    <td>{entry.team}</td>
                    <td>{entry.tech}</td>
                    <td>{entry.customerNotes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MemorialDetailPage({
  memorial,
  jobRecords = [],
  onBack = () => {},
  onOpenCustomer = () => {},
  showCustomerAction = true
}) {
  if (!memorial) {
    return (
      <>
        <h1 className="page-title">Memorial Detail</h1>
        <p className="page-subtitle">No memorial selected.</p>
        <button type="button" className="ghost-btn" onClick={onBack}>
          Back to Memorials
        </button>
      </>
    );
  }

  const relatedJobs = (jobRecords || [])
    .filter((job) => {
      if (job.memorialId && job.memorialId === memorial.id) return true;
      return memorialLookupKey(job) === memorialLookupKey(memorial);
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    });

  const latestJob = relatedJobs[0] || null;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h1 className="page-title">{memorial.memorial}</h1>
            <p className="page-subtitle">{memorial.cemetery} &middot; {memorial.customer}</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-btn" onClick={onBack}>
              Back to Memorials
            </button>
            {showCustomerAction && (
              <button type="button" className="primary-btn" onClick={() => onOpenCustomer(memorial)}>
                Open Customer
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="grid-2">
        <div className="card">
          <h3>Service Snapshot</h3>
          <ul className="service-list">
            <li>
              <strong>Plan</strong>
              <span>{memorial.plan || '-'}</span>
            </li>
            <li>
              <strong>Status</strong>
              <span>{memorial.subStatus || '-'}</span>
            </li>
            <li>
              <strong>Team / Tech</strong>
              <span>{memorial.team || 'Unassigned'} / {memorial.technician || 'Unassigned'}</span>
            </li>
            <li>
              <strong>Last Service</strong>
              <span>{memorial.lastService || '-'}</span>
            </li>
            <li>
              <strong>Next Service</strong>
              <span>{memorial.nextService || '-'}</span>
            </li>
            <li>
              <strong>Photo Status</strong>
              <span>{memorial.photoStatus || '-'}</span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h3>Latest Job Notes</h3>
          {latestJob ? (
            <ul className="service-list">
              <li>
                <strong>Customer Notes</strong>
                <span>{latestJob.customerNotes || 'No customer notes.'}</span>
              </li>
              <li>
                <strong>Leadership Notes</strong>
                <span>{latestJob.leadershipNotes || 'No leadership notes.'}</span>
              </li>
              <li>
                <strong>Photo Files</strong>
                <span>{(latestJob.photoFiles || []).length}</span>
              </li>
              <li>
                <strong>Document Files</strong>
                <span>{(latestJob.documentFiles || []).length}</span>
              </li>
            </ul>
          ) : (
            <p className="meta">No job history yet for this memorial.</p>
          )}
        </div>
      </section>

      <div className="card">
        <h3>Job History</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Team</th>
                <th>Tech</th>
                <th>Photos</th>
                <th>Docs</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {relatedJobs.length === 0 ? (
                <tr>
                  <td colSpan="7">No job records available.</td>
                </tr>
              ) : (
                relatedJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{formatDisplayDate(job.createdAt, '-')}</td>
                    <td>{job.status || '-'}</td>
                    <td>{job.team || '-'}</td>
                    <td>{job.technician || '-'}</td>
                    <td>{(job.photoFiles || []).length}</td>
                    <td>{(job.documentFiles || []).length}</td>
                    <td>{job.customerNotes || job.leadershipNotes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CustomersPage({ customers = [], onOpenCustomerDetails = () => {} }) {
  const [query, setQuery] = useState('');

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => {
      const haystack = [
        customer.name,
        customer.email,
        customer.activePlan,
        customer.serviceLocation
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [customers, query]);

  return (
    <>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Client records and associated memorials.</p>
      <p className="meta">Double-click a customer row to open details.</p>

      <div className="card memorial-filter-card">
        <label htmlFor="customer-filter">Search Customers</label>
        <input
          id="customer-filter"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by customer, email, plan, or location"
        />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Memorials</th>
                <th>Active Plan</th>
                <th>Last Contact</th>
                <th>Lifetime Value</th>
                <th>Portal Access</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="7">No customers found.</td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.email}
                    className="clickable-row"
                    onDoubleClick={() => onOpenCustomerDetails(customer)}
                    title="Double-click to view customer details"
                  >
                    <td>{customer.name}</td>
                    <td>{customer.memorials}</td>
                    <td>{customer.activePlan}</td>
                    <td>{customer.lastContact}</td>
                    <td>{customer.lifetimeValue || '$0.00'}</td>
                    <td>{customer.hasPortalAccess ? 'Enabled' : 'Disabled'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onOpenCustomerDetails(customer)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CustomerDetailPage({
  customer,
  onBack = () => {},
  onOpenMemorial = () => {}
}) {
  if (!customer) {
    return (
      <>
        <h1 className="page-title">Customer Detail</h1>
        <p className="page-subtitle">No customer selected.</p>
        <button type="button" className="ghost-btn" onClick={onBack}>
          Back to Customers
        </button>
      </>
    );
  }

  const subscriptionTagClass = customer.subscriptionStatus === 'Active' ? 'good' : 'warn';
  const memorialDetails = Array.isArray(customer.memorialDetails) ? customer.memorialDetails : [];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h1 className="page-title">{customer.name}</h1>
            <p className="page-subtitle">{customer.email}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onBack}>
            Back to Customers
          </button>
        </div>
        <div className="meta">Customer since {customer.createdAtLabel || '-'}</div>
      </div>

      <section className="grid-2">
        <div className="card">
          <h3>Service Overview</h3>
          <ul className="service-list">
            <li>
              <strong>Service Type</strong>
              <span>{customer.serviceType}</span>
            </li>
            <li>
              <strong>Service Location</strong>
              <span>{customer.serviceLocation}</span>
            </li>
            <li>
              <strong>Last Service</strong>
              <span>{customer.lastService}</span>
            </li>
            <li>
              <strong>Next Service</strong>
              <span>{customer.nextService}</span>
            </li>
            <li>
              <strong>Annual Care Plan</strong>
              <span>{customer.annualCare || 'Not enrolled'}</span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h3>Account &amp; Value</h3>
          <p><span className={`tag ${subscriptionTagClass}`}>{customer.subscriptionStatus}</span></p>
          <ul className="service-list">
            <li>
              <strong>Lifetime Value</strong>
              <span>{customer.lifetimeValue || '$0.00'}</span>
            </li>
            <li>
              <strong>Memorials Covered</strong>
              <span>{customer.memorials}</span>
            </li>
            <li>
              <strong>Last Contact</strong>
              <span>{customer.lastContact}</span>
            </li>
            <li>
              <strong>Renewal</strong>
              <span>{customer.subscriptionRenewal || '-'}</span>
            </li>
            <li>
              <strong>Portal Access</strong>
              <span>{customer.hasPortalAccess ? 'Enabled' : 'Disabled'}</span>
            </li>
          </ul>
        </div>
      </section>

      <div className="card">
        <h3>Memorial Portfolio</h3>
        <p className="meta">Each memorial includes a sub-status and service details.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Memorial</th>
                <th>Sub-Status</th>
                <th>Plan</th>
                <th>Last Service</th>
                <th>Next Service</th>
                <th>Photo Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {memorialDetails.length === 0 ? (
                <tr>
                  <td colSpan="7">No memorial detail records yet.</td>
                </tr>
              ) : (
                memorialDetails.map((memorial) => (
                  <tr key={memorial.id}>
                    <td>
                      <strong>{memorial.memorial}</strong>
                      <div className="meta">{memorial.cemetery}</div>
                    </td>
                    <td>{memorial.subStatus}</td>
                    <td>{memorial.plan}</td>
                    <td>{memorial.lastService}</td>
                    <td>{memorial.nextService}</td>
                    <td>{memorial.photoStatus}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onOpenMemorial(memorial)}
                      >
                        Open Memorial
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Customer Notes</h3>
        <p>{customer.customerNotes || 'No notes recorded yet.'}</p>
      </div>
    </>
  );
}

function CemeteriesPage({ customers = [], onOpenCustomerDetails = () => {} }) {
  const [selectedCemetery, setSelectedCemetery] = useState('All Cemeteries');

  const cemeteryRecords = useMemo(() => (
    customers.flatMap((customer) => {
      const details = Array.isArray(customer.memorialDetails) ? customer.memorialDetails : [];
      return details.map((detail) => ({
        id: `${customer.email}-${detail.id}`,
        customerEmail: customer.email,
        customerName: customer.name,
        memorial: detail.memorial,
        cemetery: detail.cemetery,
        nextService: detail.nextService,
        subStatus: detail.subStatus
      }));
    })
  ), [customers]);

  const cemeteryOptions = useMemo(
    () => ['All Cemeteries', ...Array.from(new Set(cemeteryRecords.map((record) => record.cemetery)))],
    [cemeteryRecords]
  );

  const filteredRecords = useMemo(() => (
    cemeteryRecords.filter((record) => (
      selectedCemetery === 'All Cemeteries' || record.cemetery === selectedCemetery
    ))
  ), [cemeteryRecords, selectedCemetery]);

  return (
    <>
      <h1 className="page-title">Cemeteries</h1>
      <p className="page-subtitle">Select a cemetery and drill into all related memorial records.</p>

      <div className="card">
        <div className="filters-row">
          <select value={selectedCemetery} onChange={(event) => setSelectedCemetery(event.target.value)}>
            {cemeteryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cemetery</th>
                <th>Memorial</th>
                <th>Customer</th>
                <th>Next Service</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="6">No memorials found for this cemetery.</td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{record.cemetery}</td>
                    <td>{record.memorial}</td>
                    <td>{record.customerName}</td>
                    <td>{record.nextService}</td>
                    <td>{record.subStatus}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          const customer = customers.find(
                            (candidate) => candidate.email === record.customerEmail
                          );
                          if (customer) onOpenCustomerDetails(customer);
                        }}
                      >
                        Open Customer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ArchivePage() {
  const [assetFilter, setAssetFilter] = useState('All');
  const [assetSearch, setAssetSearch] = useState('');

  const assets = [
    {
      id: 'asset-1',
      type: 'Photo',
      memorial: 'Smith Family Headstone',
      customer: 'Sarah Johnson',
      uploaded: '09/12/23',
      status: 'Retain permanently'
    },
    {
      id: 'asset-2',
      type: 'Document',
      memorial: 'Jones Memorial',
      customer: 'Michael Jones',
      uploaded: '09/02/23',
      status: 'Waiver signed'
    },
    {
      id: 'asset-3',
      type: 'Photo',
      memorial: 'Carter Memorial',
      customer: 'Daniel Carter',
      uploaded: '09/23/23',
      status: 'Pending review'
    }
  ];

  const filteredAssets = useMemo(() => {
    const needle = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetFilter !== 'All' && asset.type !== assetFilter) return false;
      if (!needle) return true;
      return [asset.memorial, asset.customer, asset.status].join(' ').toLowerCase().includes(needle);
    });
  }, [assetFilter, assetSearch]);

  return (
    <>
      <h1 className="page-title">Photos & Archive</h1>
      <p className="page-subtitle">Store and retrieve photos and documents by memorial and customer.</p>

      <div className="card">
        <div className="filters-row">
          <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
            <option value="All">All Assets</option>
            <option value="Photo">Photos</option>
            <option value="Document">Documents</option>
          </select>
          <input
            type="text"
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
            placeholder="Search by memorial, customer, or status"
          />
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Memorial</th>
                <th>Customer</th>
                <th>Uploaded</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan="5">No archive assets match this filter.</td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.type}</td>
                    <td>{asset.memorial}</td>
                    <td>{asset.customer}</td>
                    <td>{asset.uploaded}</td>
                    <td>{asset.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ReportsPage() {
  const reportCards = [
    { title: 'Yearly Revenue by Service Type', value: 'Restoration 51% / Maintenance 49%' },
    { title: 'Average Lifetime Value', value: '$2,340' },
    { title: 'New Customers by Month', value: '18 in current month' },
    { title: 'Completion Rate', value: '99.1%' }
  ];

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Operational and financial insights for admin, coordinators, and tech leads.</p>

      <div className="grid-equal">
        {reportCards.map((card) => (
          <div className="card report-card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Leadership Notes by Job</h3>
          <ul className="service-list">
            <li>
              <strong>Photo Compliance</strong>
              <span>96% of completed services include complete before/after sets.</span>
            </li>
            <li>
              <strong>Route Efficiency</strong>
              <span>Southern Utah team reduced drive time by 8% this month.</span>
            </li>
          </ul>
        </div>
        <div className="card">
          <h3>Quality Data Checks</h3>
          <ul className="service-list">
            <li>
              <strong>Missing next service date</strong>
              <span>3 memorial records</span>
            </li>
            <li>
              <strong>Pending invoice closeout</strong>
              <span>5 completed jobs</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

function SettingsPage() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('hs_dark_mode') === '1';
    } catch (err) {
      return false;
    }
  });

  useEffect(() => {
    document.body.classList.toggle('theme-dark', darkMode);
    try {
      localStorage.setItem('hs_dark_mode', darkMode ? '1' : '0');
    } catch (err) {
      // ignore storage errors
    }
  }, [darkMode]);

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Workspace preferences and account-level behavior.</p>

      <div className="card form">
        <label className="toggle-label" htmlFor="dark-mode-toggle">
          <span>Dark Mode</span>
          <input
            id="dark-mode-toggle"
            type="checkbox"
            checked={darkMode}
            onChange={(event) => setDarkMode(event.target.checked)}
          />
        </label>
        <p className="meta">Keeps your preference on this browser.</p>
      </div>
    </>
  );
}

function UsersAdminPage({
  onCreateUser,
  onUpdateEmployee,
  userManagementFeedback,
  employeeAccounts
}) {
  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [employeeTeam, setEmployeeTeam] = useState('Northern Utah');
  const [employeeError, setEmployeeError] = useState('');

  const [editingEmail, setEditingEmail] = useState('');
  const [editDraft, setEditDraft] = useState({
    name: '',
    email: '',
    phone: '',
    employmentType: 'Full-time',
    team: 'Northern Utah'
  });

  const employeeUsers = useMemo(
    () => (employeeAccounts || []).slice().sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    }),
    [employeeAccounts]
  );

  function submitCreateUser() {
    const name = employeeName.trim();
    const email = employeeEmail.trim();
    const phone = employeePhone.trim();
    const team = employeeTeam.trim();

    if (!name || !email) {
      setEmployeeError('Name and email are required.');
      return;
    }

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) {
      setEmployeeError('Enter a valid email address.');
      return;
    }

    const result = onCreateUser({
      userType: 'employee',
      name,
      email,
      extraFields: {
        phone,
        employmentType,
        team
      }
    });

    if (!result || result.error) {
      setEmployeeError(result && result.error ? result.error : 'Unable to create user.');
      return;
    }

    setEmployeeError('');
    setEmployeeName('');
    setEmployeeEmail('');
    setEmployeePhone('');
    setEmploymentType('Full-time');
    setEmployeeTeam('Northern Utah');
  }

  function startEdit(account) {
    setEditingEmail(account.email);
    setEditDraft({
      name: account.name || '',
      email: account.email || '',
      phone: account.phone || '',
      employmentType: account.employmentType || 'Full-time',
      team: account.team || 'Northern Utah'
    });
    setEmployeeError('');
  }

  function saveEdit() {
    if (!editingEmail) return;
    const name = editDraft.name.trim();
    const email = editDraft.email.trim();
    if (!name || !email) {
      setEmployeeError('Name and email are required for updates.');
      return;
    }

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) {
      setEmployeeError('Enter a valid email address.');
      return;
    }

    const result = onUpdateEmployee({
      originalEmail: editingEmail,
      name,
      email,
      phone: editDraft.phone.trim(),
      employmentType: editDraft.employmentType,
      team: editDraft.team.trim()
    });

    if (!result || result.error) {
      setEmployeeError(result && result.error ? result.error : 'Unable to update employee.');
      return;
    }

    setEmployeeError('');
    setEditingEmail('');
  }

  return (
    <>
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">Manage employee access. Customer login access is disabled.</p>

      {userManagementFeedback && (
        <div className="card form-success">
          <strong>{userManagementFeedback.mode === 'updated' ? 'Employee Updated' : 'Employee Created'}</strong>
          <p>
            {userManagementFeedback.name} ({userManagementFeedback.email})
            {userManagementFeedback.team ? ` · ${userManagementFeedback.team}` : ''}
          </p>
        </div>
      )}

      <div className="card form">
        <h3>Create Employee User</h3>
        {employeeError && <p className="form-error">{employeeError}</p>}

        <label>Employee Name *</label>
        <input
          type="text"
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          placeholder="Full name"
        />

        <label>Employee Email *</label>
        <input
          type="email"
          value={employeeEmail}
          onChange={(event) => setEmployeeEmail(event.target.value)}
          placeholder="name@example.com"
        />

        <label>Phone</label>
        <input
          type="tel"
          value={employeePhone}
          onChange={(event) => setEmployeePhone(event.target.value)}
          placeholder="(555) 123-4567"
        />

        <label>Employment Status</label>
        <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
          <option>Full-time</option>
          <option>Part-time</option>
        </select>

        <label>Team</label>
        <input
          type="text"
          value={employeeTeam}
          onChange={(event) => setEmployeeTeam(event.target.value)}
          placeholder="Northern Utah"
        />

        <button
          type="button"
          className="primary-btn"
          onClick={submitCreateUser}
        >
          Create Employee
        </button>
      </div>

      {editingEmail && (
        <div className="card form">
          <h3>Edit Employee</h3>

          <label>Name</label>
          <input
            type="text"
            value={editDraft.name}
            onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))}
          />

          <label>Email</label>
          <input
            type="email"
            value={editDraft.email}
            onChange={(event) => setEditDraft((draft) => ({ ...draft, email: event.target.value }))}
          />

          <label>Phone</label>
          <input
            type="tel"
            value={editDraft.phone}
            onChange={(event) => setEditDraft((draft) => ({ ...draft, phone: event.target.value }))}
          />

          <label>Employment Status</label>
          <select
            value={editDraft.employmentType}
            onChange={(event) => setEditDraft((draft) => ({ ...draft, employmentType: event.target.value }))}
          >
            <option>Full-time</option>
            <option>Part-time</option>
          </select>

          <label>Team</label>
          <input
            type="text"
            value={editDraft.team}
            onChange={(event) => setEditDraft((draft) => ({ ...draft, team: event.target.value }))}
          />

          <div className="inline-actions">
            <button type="button" className="primary-btn" onClick={saveEdit}>Save Changes</button>
            <button type="button" className="ghost-btn" onClick={() => setEditingEmail('')}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Employee Access</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Employment</th>
                <th>Team</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employeeUsers.length === 0 ? (
                <tr>
                  <td colSpan="8">No employee users created yet.</td>
                </tr>
              ) : (
                employeeUsers.map((account) => (
                  <tr key={account.email}>
                    <td>{account.name || '-'}</td>
                    <td>{account.email}</td>
                    <td>{account.phone || '-'}</td>
                    <td>{account.employmentType || '-'}</td>
                    <td>{account.team || '-'}</td>
                    <td>{account.mustResetPassword ? 'Reset Required' : 'Active'}</td>
                    <td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}</td>
                    <td>
                      <button type="button" className="ghost-btn" onClick={() => startEdit(account)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function OnboardingPage({ onCreateService, onboardingFeedback }) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [memorialSearch, setMemorialSearch] = useState('');
  const [cemetery, setCemetery] = useState('');
  const [serviceType, setServiceType] = useState('Initial Restoration');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeFiles, setIntakeFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = customerName.trim();
    const trimmedEmail = customerEmail.trim();

    if (!trimmedName || !trimmedEmail) {
      setErrorMessage('Customer name and email are required.');
      return;
    }

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!validEmail) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    const result = onCreateService({
      customerName: trimmedName,
      customerEmail: trimmedEmail,
      customerPhone: customerPhone.trim(),
      memorialSearch: memorialSearch.trim(),
      cemetery: cemetery.trim(),
      serviceType,
      intakeNotes: intakeNotes.trim(),
      intakeFiles
    });

    if (!result || result.error) {
      setErrorMessage(result && result.error ? result.error : 'Unable to create service.');
      return;
    }

    setErrorMessage('');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setMemorialSearch('');
    setCemetery('');
    setServiceType('Initial Restoration');
    setIntakeNotes('');
    setIntakeFiles([]);
  }

  function handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    setIntakeFiles(files.map((file) => file.name));
  }

  return (
    <>
      <h1 className="page-title">Onboarding</h1>
      <p className="page-subtitle">Capture intake details, photos, and service setup without customer login provisioning.</p>

      {onboardingFeedback && (
        <div className="card form-success">
          <strong>Service Intake Created</strong>
          <p>{onboardingFeedback.name} ({onboardingFeedback.email}) is now in the onboarding pipeline.</p>
          <p>Customer login access remains disabled by default.</p>
          <p>{onboardingFeedback.intakeFiles || 0} intake files attached.</p>
        </div>
      )}

      <form className="card form" onSubmit={handleSubmit}>
        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <label>Customer Name *</label>
        <input
          type="text"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
          placeholder="Full name"
          required
        />

        <label>Customer Email *</label>
        <input
          type="email"
          value={customerEmail}
          onChange={(event) => setCustomerEmail(event.target.value)}
          placeholder="name@example.com"
          required
        />

        <label>Customer Phone</label>
        <input
          type="tel"
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="(555) 123-4567"
        />

        <label>Search Memorial (GPS / BillionGraves)</label>
        <input
          type="text"
          value={memorialSearch}
          onChange={(event) => setMemorialSearch(event.target.value)}
          placeholder="Search by name, cemetery, or GPS"
        />

        <label>Cemetery</label>
        <input
          type="text"
          value={cemetery}
          onChange={(event) => setCemetery(event.target.value)}
        />

        <label>Service Type</label>
        <select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
          <option>Initial Restoration</option>
          <option>Maintenance Plan</option>
        </select>

        <label>Initial Notes</label>
        <textarea
          value={intakeNotes}
          onChange={(event) => setIntakeNotes(event.target.value)}
          placeholder="Customer call notes, permissions, upsell opportunities, and quality requirements."
        />

        <label>Initial Photos / Documents</label>
        <input type="file" multiple onChange={handleFileSelection} />
        {intakeFiles.length > 0 && (
          <ul className="compact-list">
            {intakeFiles.map((fileName) => (
              <li key={fileName}>{fileName}</li>
            ))}
          </ul>
        )}

        <button type="submit" className="primary-btn">Create Service</button>
      </form>
    </>
  );
}

function EmployeeDashboardPage() {
  const [scheduleView, setScheduleView] = useState('Daily');

  return (
    <>
      <h1 className="page-title">Crew Dashboard</h1>
      <p className="page-subtitle">Daily, weekly, and monthly schedule snapshot with crew and note context.</p>

      <div className="toggle-group">
        {['Daily', 'Weekly', 'Monthly'].map((view) => (
          <button
            key={view}
            type="button"
            className={`toggle-btn${scheduleView === view ? ' active' : ''}`}
            onClick={() => setScheduleView(view)}
          >
            {view}
          </button>
        ))}
      </div>

      <section className="grid-2">
        <div className="card">
          <h3>{scheduleView} Schedule</h3>
          <p>Smith Family Headstone</p>
          <div className="meta">9:00 AM &middot; Greenwood Cemetery &middot; Northern Utah Crew</div>
          <div className="inline-actions">
            <button className="primary-btn">View Route</button>
            <button className="ghost-btn">Optimize Route</button>
          </div>
        </div>
        <div className="card">
          <h3>Crew Info</h3>
          <ul className="service-list">
            <li>
              <strong>Team</strong>
              <span>Northern Utah</span>
            </li>
            <li>
              <strong>Lead Tech</strong>
              <span>Spencer</span>
            </li>
            <li>
              <strong>Shift Type</strong>
              <span>Full-time field day</span>
            </li>
          </ul>
          <button className="ghost-btn">Flag Scheduling Issue</button>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Upcoming Stops</h3>
          <ul className="service-list">
            {DEFAULT_SCHEDULE_ENTRIES.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.memorial}</strong>
                <span>{entry.cemetery}</span>
                <div className="meta">{entry.time} &middot; {entry.tech}</div>
                <div className="meta">Customer note: {entry.customerNotes}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Leadership Notes</h3>
          <ul className="service-list">
            {DEFAULT_SCHEDULE_ENTRIES.map((entry) => (
              <li key={`${entry.id}-leadership`}>
                <strong>{entry.memorial}</strong>
                <span>{entry.leadershipNotes}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

function EmployeeSchedulingPage() {
  const [viewMode, setViewMode] = useState('week');
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [techFilter, setTechFilter] = useState('All Techs');

  const teams = useMemo(
    () => ['All Teams', ...Array.from(new Set(DEFAULT_SCHEDULE_ENTRIES.map((entry) => entry.team)))],
    []
  );
  const techs = useMemo(
    () => ['All Techs', ...Array.from(new Set(DEFAULT_SCHEDULE_ENTRIES.map((entry) => entry.tech)))],
    []
  );

  const filteredSchedule = useMemo(() => (
    DEFAULT_SCHEDULE_ENTRIES.filter((entry) => {
      if (teamFilter !== 'All Teams' && entry.team !== teamFilter) return false;
      if (techFilter !== 'All Techs' && entry.tech !== techFilter) return false;
      return true;
    })
  ), [teamFilter, techFilter]);

  return (
    <>
      <h1 className="page-title">My Schedule</h1>
      <p className="page-subtitle">Drill into day/week/month views and filter by team or technician.</p>

      <div className="card">
        <div className="toggle-group">
          {['day', 'week', 'month'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`toggle-btn${viewMode === mode ? ' active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div className="filters-row">
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            {teams.map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
          <select value={techFilter} onChange={(event) => setTechFilter(event.target.value)}>
            {techs.map((tech) => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
        </div>

        <div className="calendar-placeholder">
          {viewMode[0].toUpperCase() + viewMode.slice(1)} calendar preview
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Memorial</th>
                <th>Team</th>
                <th>Tech</th>
                <th>Customer Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedule.length === 0 ? (
                <tr>
                  <td colSpan="5">No assignments match this filter.</td>
                </tr>
              ) : (
                filteredSchedule.map((entry) => (
                  <tr key={`employee-${entry.id}`}>
                    <td>{entry.time}</td>
                    <td>{entry.memorial}</td>
                    <td>{entry.team}</td>
                    <td>{entry.tech}</td>
                    <td>{entry.customerNotes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CustomerDashboardPage() {
  return (
    <>
      <h1 className="page-title">Customer Overview</h1>
      <p className="page-subtitle">Your memorials, service history, and upcoming visits.</p>

      <section className="grid-2">
        <div className="card">
          <h3>Next Service</h3>
          <p>Smith Family Headstone</p>
          <div className="meta">Scheduled for 10/12/23</div>
          <button className="primary-btn">View Details</button>
        </div>
        <div className="card">
          <h3>Service Status</h3>
          <p>Maintenance plan active</p>
          <div className="progress">
            <div className="progress-bar"></div>
          </div>
          <span className="meta">72% of yearly plan complete</span>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Recent Updates</h3>
          <ul className="service-list">
            <li>
              <strong>Photo Review</strong>
              <span>2 new photos added</span>
              <div className="meta">Yesterday</div>
            </li>
            <li>
              <strong>Service Complete</strong>
              <span>Cleaning finished</span>
              <div className="meta">09/23/23</div>
            </li>
          </ul>
        </div>
        <div className="card">
          <h3>Support</h3>
          <p>Questions about services or billing?</p>
          <button className="ghost-btn">Contact Support</button>
        </div>
      </section>
    </>
  );
}

function CustomerMemorialsPage() {
  return (
    <>
      <h1 className="page-title">My Memorials</h1>
      <p className="page-subtitle">Active memorials under your care plan.</p>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Memorial</th>
                <th>Cemetery</th>
                <th>Plan</th>
                <th>Next Service</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Smith Family Headstone</td>
                <td>Greenwood Cemetery</td>
                <td>Annual Maintenance</td>
                <td>10/12/23</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CustomerSettingsPage() {
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Notification preferences and account details.</p>

      <div className="card form">
        <label>Email</label>
        <input type="email" placeholder="name@example.com" />

        <label>Phone</label>
        <input type="tel" placeholder="(555) 123-4567" />

        <label>Notification Frequency</label>
        <select>
          <option>Immediately</option>
          <option>Daily Digest</option>
          <option>Weekly Summary</option>
        </select>

        <button className="primary-btn">Save Preferences</button>
      </div>
    </>
  );
}

function TestingLoginPage({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [destinationRole, setDestinationRole] = useState('admin');
  const [errorMessage, setErrorMessage] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setErrorMessage('Email and password are required.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    const result = onSignIn({
      email: trimmedEmail,
      password,
      destinationRole
    });

    if (!result || result.error) {
      setErrorMessage(result && result.error ? result.error : 'Unable to sign in.');
      return;
    }

    setErrorMessage('');
  }

  return (
    <>
      <h1 className="page-title">Login</h1>
      <p className="page-subtitle">Testing login screen for role and account access.</p>

      <form className="card form auth-card" onSubmit={handleSubmit}>
        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          required
        />

        <label>Sign in As</label>
        <select value={destinationRole} onChange={(event) => setDestinationRole(event.target.value)}>
          <option value="admin">Admin</option>
          <option value="employee">Employee</option>
          <option value="customer">Customer</option>
        </select>

        <button type="submit" className="primary-btn">Sign In</button>
      </form>
    </>
  );
}

function CustomerAuthPage({ resetEmail, onLogin, onResetPassword, onCancelReset }) {
  const [email, setEmail] = useState(resetEmail || '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isResetFlow = Boolean(resetEmail);

  useEffect(() => {
    setEmail(resetEmail || '');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage('');
  }, [resetEmail]);

  function handleLoginSubmit(event) {
    event.preventDefault();
    const result = onLogin({
      email,
      password
    });

    if (!result || result.error) {
      setErrorMessage(result && result.error ? result.error : 'Unable to log in.');
      return;
    }

    setErrorMessage('');
  }

  function handleResetSubmit(event) {
    event.preventDefault();

    if (newPassword.trim().length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const result = onResetPassword({
      email: resetEmail,
      newPassword
    });

    if (!result || result.error) {
      setErrorMessage(result && result.error ? result.error : 'Unable to reset password.');
      return;
    }

    setErrorMessage('');
  }

  return (
    <>
      <h1 className="page-title">Customer Login</h1>
      <p className="page-subtitle">
        {isResetFlow ? 'Reset your password to continue.' : 'Sign in to access customer views.'}
      </p>

      <form className="card form auth-card" onSubmit={isResetFlow ? handleResetSubmit : handleLoginSubmit}>
        {errorMessage && <p className="form-error">{errorMessage}</p>}

        {!isResetFlow && (
          <>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />

            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              required
            />
          </>
        )}

        {isResetFlow && (
          <>
            <label>Email</label>
            <input type="email" value={resetEmail} readOnly />

            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
            />

            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </>
        )}

        <button type="submit" className="primary-btn">
          {isResetFlow ? 'Reset Password' : 'Sign In'}
        </button>

        {isResetFlow && (
          <button type="button" className="ghost-btn" onClick={onCancelReset}>
            Use Different Account
          </button>
        )}
      </form>
    </>
  );
}

function Layout({
  role,
  testingView,
  isLoginView,
  navItems,
  currentPath,
  onTestingViewChange,
  onNewService,
  customerSessionEmail,
  onCustomerLogout,
  searchQuery,
  searchResults,
  onSearchQueryChange,
  onSearchSubmit,
  onSearchSelect,
  children
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (isSidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }

    return () => {
      document.body.classList.remove('sidebar-open');
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentPath]);

  function handleToggleMenu() {
    setIsSidebarOpen((open) => !open);
  }

  function handleCloseMenu() {
    setIsSidebarOpen(false);
  }

  const isAdminCustomerDetail = currentPath === '/admin/customerdetail';

  return (
    <>
      {!isLoginView && (
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-icon"></div>
            <div className="logo-text">
              <strong>Headstone</strong>
              <span>Restoration</span>
            </div>
          </div>

          <nav className="nav">
            {navItems.map((item) => (
              <a
                key={item.id}
                className={`nav-item${
                  item.to === currentPath || (isAdminCustomerDetail && item.id === 'customers')
                    ? ' active'
                    : ''
                }`}
                href={`#${item.to}`}
                onClick={handleCloseMenu}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
      )}

      <div className={`main${isLoginView ? ' main-login' : ''}`}>
        <header className={`topbar${isLoginView ? ' topbar-login' : ''}`}>
          {!isLoginView && (
            <button
              className="hamburger"
              aria-label="Toggle navigation"
              aria-expanded={isSidebarOpen}
              onClick={handleToggleMenu}
            >
              <span className="bar"></span>
            </button>
          )}
          {!isLoginView && (
            <div className="search">
              <form
                className="search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSearchSubmit();
                }}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      onSearchQueryChange('');
                    }
                  }}
                  placeholder="Search memorials, customers, cemeteries, GPS..."
                />
                {searchQuery.trim() !== '' && (
                  <div className="search-results" role="listbox" aria-label="Search results">
                    {searchResults.length > 0 ? (
                      searchResults.map((result) => (
                        <button
                          key={`${result.to}-${result.title}`}
                          type="button"
                          className="search-result-item"
                          onClick={() => onSearchSelect(result.to)}
                        >
                          <span className="search-result-title">{result.title}</span>
                          <span className="search-result-meta">{result.description}</span>
                        </button>
                      ))
                    ) : (
                      <div className="search-empty">No matches in this view</div>
                    )}
                  </div>
                )}
              </form>
            </div>
          )}

          <div className="topbar-actions">
            <div className="role-switch">
              <label className="role-switch-label" htmlFor="testing-view-select">Testing View</label>
              <select
                id="testing-view-select"
                className="role-select"
                value={testingView}
                onChange={(event) => onTestingViewChange(event.target.value)}
              >
                {TEST_VIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {!isLoginView && <div className="bell"></div>}
            {role === 'admin' && !isLoginView && (
              <button className="primary-btn" onClick={onNewService}>New Service</button>
            )}
            {role === 'customer' && customerSessionEmail && !isLoginView && (
              <button className="ghost-btn" onClick={onCustomerLogout}>Logout</button>
            )}
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      {!isLoginView && <div className="menu-overlay" onClick={handleCloseMenu}></div>}
    </>
  );
}

function App() {
  const [path, navigate] = useHashPath();
  const [searchQuery, setSearchQuery] = useState('');
  const [customerAccounts, setCustomerAccounts] = useState(loadCustomerAccounts);
  const [employeeAccounts, setEmployeeAccounts] = useState(loadEmployeeAccounts);
  const [jobRecords, setJobRecords] = useState(loadJobRecords);
  const [selectedAdminCustomerEmail, setSelectedAdminCustomerEmail] = useState('');
  const [selectedMemorialId, setSelectedMemorialId] = useState('');
  const [customerSessionEmail, setCustomerSessionEmail] = useState(loadCustomerSession);
  const [customerResetEmail, setCustomerResetEmail] = useState('');
  const [customerViewBypassAuth, setCustomerViewBypassAuth] = useState(false);
  const [onboardingFeedback, setOnboardingFeedback] = useState(null);
  const [userManagementFeedback, setUserManagementFeedback] = useState(null);
  const { role, page, config, canonicalPath, view } = useMemo(() => parseRoute(path), [path]);
  const isLoginView = view === 'login';
  const testingView = isLoginView ? 'login' : role;

  useEffect(() => {
    try {
      const darkModeEnabled = localStorage.getItem('hs_dark_mode') === '1';
      document.body.classList.toggle('theme-dark', darkModeEnabled);
    } catch (err) {
      // ignore storage access issues
    }
  }, []);

  useEffect(() => {
    if (!canonicalPath) return;
    if (path !== canonicalPath) {
      navigate(canonicalPath);
    }
  }, [canonicalPath, navigate, path]);

  useEffect(() => {
    storeRole(role);
  }, [role]);

  useEffect(() => {
    setSearchQuery('');
  }, [canonicalPath]);

  useEffect(() => {
    saveCustomerAccounts(customerAccounts);
  }, [customerAccounts]);

  useEffect(() => {
    saveEmployeeAccounts(employeeAccounts);
  }, [employeeAccounts]);

  useEffect(() => {
    saveJobRecords(jobRecords);
  }, [jobRecords]);

  useEffect(() => {
    storeCustomerSession(customerSessionEmail);
  }, [customerSessionEmail]);

  useEffect(() => {
    if (!customerSessionEmail) return;
    const exists = customerAccounts.some((account) => account.email === customerSessionEmail);
    if (!exists) {
      setCustomerSessionEmail('');
    }
  }, [customerAccounts, customerSessionEmail]);

  useEffect(() => {
    if (!(role === 'admin' && page === 'onboarding')) {
      setOnboardingFeedback(null);
    }
  }, [role, page]);

  useEffect(() => {
    if (!(role === 'admin' && page === 'users')) {
      setUserManagementFeedback(null);
    }
  }, [role, page]);

  useEffect(() => {
    if (isLoginView || role !== 'customer') {
      setCustomerViewBypassAuth(false);
    }
  }, [isLoginView, role]);

  const routeMap = ROUTES[role] || ROUTES.admin;
  const PageComponent = routeMap[page] || routeMap[config.defaultRoute];
  const adminCustomers = useMemo(() => buildAdminCustomers(customerAccounts), [customerAccounts]);
  const memorialRecords = useMemo(
    () => buildMemorialRecords(adminCustomers, jobRecords),
    [adminCustomers, jobRecords]
  );
  const selectedAdminCustomer = useMemo(() => {
    const normalizedEmail = normalizeEmail(selectedAdminCustomerEmail);
    if (!normalizedEmail) return null;
    return adminCustomers.find((customer) => customer.email === normalizedEmail) || null;
  }, [adminCustomers, selectedAdminCustomerEmail]);
  const selectedMemorial = useMemo(
    () => memorialRecords.find((record) => record.id === selectedMemorialId) || null,
    [memorialRecords, selectedMemorialId]
  );
  const searchResults = useMemo(() => getSearchResults(role, searchQuery), [role, searchQuery]);

  function handleTestingViewChange(nextView) {
    if (nextView === 'login') {
      setCustomerViewBypassAuth(false);
      navigate('/login');
      return;
    }

    setCustomerViewBypassAuth(nextView === 'customer');
    const nextConfig = ROLE_CONFIGS[nextView] || ROLE_CONFIGS.admin;
    navigate(`${nextConfig.basePath}/${nextConfig.defaultRoute}`);
  }

  function handleNewService() {
    navigate('/admin/onboarding');
  }

  function handleOpenCustomerDetails(customer) {
    if (!customer || !customer.email) return;
    setSelectedAdminCustomerEmail(normalizeEmail(customer.email));
    navigate('/admin/customerdetail');
  }

  function handleBackToCustomers() {
    navigate('/admin/customers');
  }

  function handleOpenMemorialDetails(record, roleOverride) {
    if (!record || !record.id) return;
    const destinationRole = roleOverride || role;
    setSelectedMemorialId(record.id);
    navigate(`/${destinationRole}/memorialdetail`);
  }

  function handleBackToMemorials(roleOverride) {
    const destinationRole = roleOverride || role;
    navigate(`/${destinationRole}/memorials`);
  }

  function handleOpenCustomerFromMemorial(memorial) {
    if (!memorial) return;
    const targetCustomer = adminCustomers.find(
      (candidate) => normalizeText(candidate.name) === normalizeText(memorial.customer)
    );
    if (targetCustomer) {
      handleOpenCustomerDetails(targetCustomer);
    }
  }

  function handleSearchSelect(nextPath) {
    setSearchQuery('');
    navigate(nextPath);
  }

  function handleSearchSubmit() {
    if (searchResults.length > 0) {
      handleSearchSelect(searchResults[0].to);
    }
  }

  useEffect(() => {
    if (!(role === 'admin' && page === 'customerdetail')) {
      return;
    }

    if (selectedAdminCustomer) {
      return;
    }

    if (adminCustomers.length === 0) {
      navigate('/admin/customers');
      return;
    }

    setSelectedAdminCustomerEmail(adminCustomers[0].email);
  }, [adminCustomers, navigate, page, role, selectedAdminCustomer]);

  useEffect(() => {
    if (!(page === 'memorialdetail' && (role === 'admin' || role === 'employee'))) {
      return;
    }

    if (selectedMemorial) {
      return;
    }

    if (memorialRecords.length === 0) {
      handleBackToMemorials(role);
      return;
    }

    setSelectedMemorialId(memorialRecords[0].id);
  }, [memorialRecords, page, role, selectedMemorial]);

  function createManagedUser({
    userType,
    name,
    email,
    extraFields,
    provisionPortalAccess = true
  }) {
    const normalizedType = userType === 'employee' ? 'employee' : 'customer';
    const normalizedName = (name || '').trim();
    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();

    if (!normalizedName || !normalizedEmail) {
      return { error: 'Name and email are required.' };
    }

    const isEmployee = normalizedType === 'employee';
    const currentAccounts = isEmployee ? employeeAccounts : customerAccounts;
    const existingAccount = currentAccounts.find((account) => account.email === normalizedEmail);
    const shouldProvisionPortal = isEmployee ? true : provisionPortalAccess;
    const temporaryPassword = existingAccount
      ? (existingAccount.password || (shouldProvisionPortal ? generateTempPassword() : ''))
      : (shouldProvisionPortal ? generateTempPassword() : '');
    const mustResetPassword = existingAccount
      ? Boolean(existingAccount.mustResetPassword)
      : Boolean(shouldProvisionPortal);

    const nextAccount = {
      email: normalizedEmail,
      name: normalizedName,
      password: temporaryPassword,
      mustResetPassword,
      hasPortalAccess: shouldProvisionPortal,
      userType: normalizedType,
      updatedAt: now,
      createdAt: existingAccount ? existingAccount.createdAt : now,
      ...(extraFields || {})
    };

    const nextAccounts = existingAccount
      ? currentAccounts.map((account) => (account.email === normalizedEmail ? nextAccount : account))
      : [...currentAccounts, nextAccount];

    if (isEmployee) {
      setEmployeeAccounts(nextAccounts);
    } else {
      setCustomerAccounts(nextAccounts);
    }

    if (shouldProvisionPortal && !existingAccount) {
      queueTempPasswordEmail({
        email: normalizedEmail,
        name: normalizedName,
        temporaryPassword,
        userType: normalizedType
      });
    }

    return {
      ok: true,
      created: !existingAccount,
      userType: normalizedType,
      name: normalizedName,
      email: normalizedEmail,
      tempPassword: !existingAccount ? temporaryPassword : ''
    };
  }

  function handleCreateService(payload) {
    const memorialName = payload.memorialSearch || `${payload.customerName} Memorial`;
    const memorialId = `${normalizeEmail(payload.customerEmail)}-intake`;
    const result = createManagedUser({
      userType: 'customer',
      name: payload.customerName,
      email: payload.customerEmail,
      provisionPortalAccess: false,
      extraFields: {
        serviceType: payload.serviceType || 'Initial Restoration',
        cemetery: payload.cemetery || 'Pending Assignment',
        customerNotes: payload.intakeNotes || 'No notes recorded yet.',
        lifetimeValue: '$0.00',
        memorialDetails: [
          {
            id: memorialId,
            memorial: memorialName,
            cemetery: payload.cemetery || 'Pending Assignment',
            subStatus: 'Intake',
            plan: payload.serviceType || 'Initial Restoration',
            nextService: 'Quote pending approval',
            lastService: 'Not Started',
            serviceInfo: payload.customerPhone
              ? `Contact: ${payload.customerPhone}`
              : 'Customer onboarding in progress',
            photoStatus: payload.intakeFiles && payload.intakeFiles.length > 0
              ? `${payload.intakeFiles.length} intake file(s) uploaded`
              : 'No photos uploaded'
          }
        ]
      }
    });

    if (!result || result.error) {
      return result || { error: 'Unable to create service.' };
    }

    setJobRecords((records) => [
      {
        id: `job-${Date.now()}`,
        memorialId,
        memorial: memorialName,
        customer: payload.customerName,
        cemetery: payload.cemetery || 'Pending Assignment',
        status: 'Intake',
        createdAt: new Date().toISOString(),
        completedAt: '',
        nextService: 'Quote pending approval',
        team: 'Unassigned',
        technician: 'Unassigned',
        customerNotes: payload.intakeNotes || 'No customer notes.',
        leadershipNotes: 'Intake record created from onboarding.',
        photoFiles: payload.intakeFiles || [],
        documentFiles: []
      },
      ...records
    ]);

    setOnboardingFeedback({
      name: result.name,
      email: result.email,
      intakeFiles: (payload.intakeFiles || []).length
    });

    return { ok: true };
  }

  function handleCreateUser(payload) {
    const result = createManagedUser({
      userType: payload.userType,
      name: payload.name,
      email: payload.email,
      extraFields: payload.extraFields
    });

    if (!result || result.error) {
      return result || { error: 'Unable to create user.' };
    }

    setUserManagementFeedback({
      mode: 'created',
      name: result.name,
      email: result.email,
      team: payload.extraFields?.team || ''
    });

    return { ok: true };
  }

  function handleUpdateEmployee(payload) {
    const originalEmail = normalizeEmail(payload.originalEmail);
    const nextEmail = normalizeEmail(payload.email);
    if (!originalEmail) return { error: 'Employee record is missing.' };

    const existing = employeeAccounts.find((account) => account.email === originalEmail);
    if (!existing) return { error: 'Employee not found.' };

    if (
      nextEmail !== originalEmail
      && employeeAccounts.some((account) => account.email === nextEmail)
    ) {
      return { error: 'Another employee already uses that email.' };
    }

    const nextAccounts = employeeAccounts.map((account) => {
      if (account.email !== originalEmail) return account;
      return {
        ...account,
        name: payload.name,
        email: nextEmail,
        phone: payload.phone,
        employmentType: payload.employmentType,
        team: payload.team,
        updatedAt: new Date().toISOString()
      };
    });

    setEmployeeAccounts(nextAccounts);
    setUserManagementFeedback({
      mode: 'updated',
      name: payload.name,
      email: nextEmail,
      team: payload.team
    });
    return { ok: true };
  }

  function handleCustomerLogin({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const account = customerAccounts.find((candidate) => candidate.email === normalizedEmail);

    if (!account) {
      return { error: 'Invalid email or password.' };
    }

    if (account.hasPortalAccess === false) {
      return { error: 'Customer portal access is disabled for this account.' };
    }

    if (!account.password || account.password !== password) {
      return { error: 'Invalid email or password.' };
    }

    if (account.mustResetPassword) {
      setCustomerResetEmail(normalizedEmail);
      return { ok: true, requiresReset: true };
    }

    setCustomerResetEmail('');
    setCustomerSessionEmail(normalizedEmail);
    return { ok: true };
  }

  function handleCustomerPasswordReset({ email, newPassword }) {
    const normalizedEmail = normalizeEmail(email);
    const account = customerAccounts.find((candidate) => candidate.email === normalizedEmail);

    if (!account) {
      return { error: 'Account not found.' };
    }

    const nextAccounts = customerAccounts.map((candidate) => {
      if (candidate.email !== normalizedEmail) {
        return candidate;
      }

      return {
        ...candidate,
        password: newPassword,
        mustResetPassword: false,
        updatedAt: new Date().toISOString()
      };
    });

    setCustomerAccounts(nextAccounts);
    setCustomerResetEmail('');
    setCustomerSessionEmail(normalizedEmail);
    return { ok: true };
  }

  function handleCancelCustomerReset() {
    setCustomerResetEmail('');
  }

  function handleCustomerLogout() {
    setCustomerSessionEmail('');
    setCustomerResetEmail('');
  }

  function handleTestingLogin({ email, password, destinationRole }) {
    if (destinationRole === 'customer') {
      const result = handleCustomerLogin({ email, password });
      if (!result || result.error) {
        return result || { error: 'Unable to sign in as customer.' };
      }
      setCustomerViewBypassAuth(false);
    }

    const nextConfig = ROLE_CONFIGS[destinationRole] || ROLE_CONFIGS.admin;
    navigate(`${nextConfig.basePath}/${nextConfig.defaultRoute}`);
    return { ok: true };
  }

  let pageElement = isLoginView ? <TestingLoginPage onSignIn={handleTestingLogin} /> : <PageComponent />;

  if (!isLoginView && role === 'admin' && page === 'onboarding') {
    pageElement = (
      <OnboardingPage
        onCreateService={handleCreateService}
        onboardingFeedback={onboardingFeedback}
      />
    );
  }

  if (!isLoginView && role === 'admin' && page === 'users') {
    pageElement = (
      <UsersAdminPage
        onCreateUser={handleCreateUser}
        onUpdateEmployee={handleUpdateEmployee}
        userManagementFeedback={userManagementFeedback}
        employeeAccounts={employeeAccounts}
      />
    );
  }

  if (!isLoginView && role === 'admin' && page === 'customers') {
    pageElement = (
      <CustomersPage
        customers={adminCustomers}
        onOpenCustomerDetails={handleOpenCustomerDetails}
      />
    );
  }

  if (!isLoginView && role === 'admin' && page === 'customerdetail') {
    pageElement = (
      <CustomerDetailPage
        customer={selectedAdminCustomer}
        onBack={handleBackToCustomers}
        onOpenMemorial={(memorial) => {
          if (!memorial) return;
          const matching = memorialRecords.find(
            (record) => memorialLookupKey(record) === memorialLookupKey({
              memorial: memorial.memorial,
              customer: selectedAdminCustomer?.name || '',
              cemetery: memorial.cemetery
            })
          );
          if (matching) {
            handleOpenMemorialDetails(matching, 'admin');
            return;
          }
          handleOpenMemorialDetails({
            ...memorial,
            id: memorial.id || memorialLookupKey({
              memorial: memorial.memorial,
              customer: selectedAdminCustomer?.name || '',
              cemetery: memorial.cemetery
            })
          }, 'admin');
        }}
      />
    );
  }

  if (!isLoginView && role === 'admin' && page === 'cemeteries') {
    pageElement = (
      <CemeteriesPage
        customers={adminCustomers}
        onOpenCustomerDetails={handleOpenCustomerDetails}
      />
    );
  }

  if (!isLoginView && page === 'memorials' && (role === 'admin' || role === 'employee')) {
    pageElement = (
      <MemorialsPage
        memorialRecords={memorialRecords}
        onOpenMemorial={(record) => handleOpenMemorialDetails(record, role)}
      />
    );
  }

  if (!isLoginView && page === 'memorialdetail' && (role === 'admin' || role === 'employee')) {
    pageElement = (
      <MemorialDetailPage
        memorial={selectedMemorial}
        jobRecords={jobRecords}
        onBack={() => handleBackToMemorials(role)}
        onOpenCustomer={handleOpenCustomerFromMemorial}
        showCustomerAction={role === 'admin'}
      />
    );
  }

  if (!isLoginView && role === 'customer' && !customerSessionEmail && !customerViewBypassAuth) {
    pageElement = (
      <CustomerAuthPage
        resetEmail={customerResetEmail}
        onLogin={handleCustomerLogin}
        onResetPassword={handleCustomerPasswordReset}
        onCancelReset={handleCancelCustomerReset}
      />
    );
  }

  return (
    <Layout
      role={role}
      testingView={testingView}
      isLoginView={isLoginView}
      navItems={isLoginView ? [] : config.nav}
      currentPath={canonicalPath}
      onTestingViewChange={handleTestingViewChange}
      onNewService={handleNewService}
      customerSessionEmail={customerSessionEmail}
      onCustomerLogout={handleCustomerLogout}
      searchQuery={searchQuery}
      searchResults={searchResults}
      onSearchQueryChange={setSearchQuery}
      onSearchSubmit={handleSearchSubmit}
      onSearchSelect={handleSearchSelect}
    >
      {pageElement}
    </Layout>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
