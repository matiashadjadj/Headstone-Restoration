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
      description: 'Create customer and employee accounts',
      to: '/admin/users',
      keywords: 'users create user employee customer account temp password'
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
    createdAtLabel: '04/10/23'
  }
];

function formatDisplayDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString();
}

function buildAdminCustomers(accounts) {
  const customersByEmail = new Map();

  DEFAULT_ADMIN_CUSTOMERS.forEach((customer) => {
    const email = normalizeEmail(customer.email);
    customersByEmail.set(email, {
      ...customer,
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

    customersByEmail.set(email, {
      email,
      name: account.name || existing.name || email,
      memorials: existing.memorials || 1,
      activePlan: account.serviceType || existing.activePlan || 'Initial Restoration',
      lastContact,
      serviceType,
      serviceLocation: existing.serviceLocation || 'Pending Assignment',
      lastService: existing.lastService || 'Not Started',
      nextService: existing.nextService || 'To Be Scheduled',
      subscriptionStatus: account.mustResetPassword
        ? 'Pending Activation'
        : existing.subscriptionStatus || 'Active',
      subscriptionRenewal: existing.subscriptionRenewal || createdAtLabel,
      createdAtLabel,
      mustResetPassword: Boolean(account.mustResetPassword)
    });
  });

  return Array.from(customersByEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
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
  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Overview of restoration activity, revenue, and scheduling.</p>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Total Revenue</span>
          <strong>$38,420.50</strong>
          <small className="positive">+12% from last month</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Active Services</span>
          <strong>18</strong>
          <small>6 scheduled today</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Crews Active</span>
          <strong>5</strong>
          <small>Currently in field</small>
        </div>

        <div className="kpi">
          <span className="kpi-label">Completion Rate</span>
          <strong>99.1%</strong>
          <small>Last 30 days</small>
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
              <span>Greenwood Cemetery</span>
              <div className="meta">9:00 AM &middot; GPS Verified &middot; Crew A</div>
            </li>
            <li>
              <strong>Jones Memorial</strong>
              <span>Oakwood Memorial Park</span>
              <div className="meta">10:30 AM &middot; GPS Verified &middot; Crew B</div>
            </li>
            <li>
              <strong>Thompson Headstone</strong>
              <span>Hillcrest Cemetery</span>
              <div className="meta">11:00 AM &middot; Maintenance &middot; Crew C</div>
            </li>
          </ul>
        </div>

        <div className="card">
          <h3>Monthly Revenue</h3>
          <div className="chart-placeholder">Chart goes here</div>
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
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Johnson Headstone</td>
                  <td>Elmwood Cemetery</td>
                  <td>09/12/23</td>
                  <td>$180.00</td>
                </tr>
                <tr>
                  <td>Carter Memorial</td>
                  <td>Rolling Hills</td>
                  <td>09/23/23</td>
                  <td>$160.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Photo Archive Status</h3>
          <p>4 services pending photo review</p>
          <div className="progress">
            <div className="progress-bar"></div>
          </div>
          <button className="primary-btn full">Review Photos</button>
        </div>
      </section>
    </>
  );
}

function MemorialsPage() {
  return (
    <>
      <h1 className="page-title">Memorials</h1>
      <p className="page-subtitle">Permanent records of restored and maintained memorials.</p>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Memorial</th>
                <th>Cemetery</th>
                <th>Last Service</th>
                <th>Status</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Smith Family Headstone</td>
                <td>Greenwood Cemetery</td>
                <td>09/12/23</td>
                <td><span className="tag good">Maintained</span></td>
                <td>View</td>
              </tr>
              <tr>
                <td>Johnson Memorial</td>
                <td>Oakwood Memorial Park</td>
                <td>06/03/23</td>
                <td><span className="tag warn">Needs Review</span></td>
                <td>Schedule</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SchedulingPage() {
  return (
    <>
      <h1 className="page-title">Scheduling</h1>
      <p className="page-subtitle">Upcoming and recurring restoration services.</p>

      <div className="card">
        <h3>Service Calendar</h3>
        <div className="calendar-placeholder">Calendar view goes here</div>
      </div>
    </>
  );
}

function CustomersPage({ customers = [], onOpenCustomerDetails = () => {} }) {
  return (
    <>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Client records and associated memorials.</p>
      <p className="meta">Double-click a customer row to open details.</p>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Memorials</th>
                <th>Active Plan</th>
                <th>Last Contact</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan="5">No customers found.</td>
                </tr>
              ) : (
                customers.map((customer) => (
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

function CustomerDetailPage({ customer, onBack = () => {} }) {
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
          <h3>Service Information</h3>
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
          </ul>
        </div>

        <div className="card">
          <h3>Subscription Status</h3>
          <p><span className={`tag ${subscriptionTagClass}`}>{customer.subscriptionStatus}</span></p>
          <ul className="service-list">
            <li>
              <strong>Active Plan</strong>
              <span>{customer.activePlan}</span>
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
          </ul>
        </div>
      </section>
    </>
  );
}

function CemeteriesPage() {
  return (
    <>
      <h1 className="page-title">Cemeteries</h1>
      <p className="page-subtitle">Service locations and memorial distribution.</p>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cemetery</th>
                <th>City</th>
                <th>Memorials</th>
                <th>Active Services</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Greenwood Cemetery</td>
                <td>Ogden</td>
                <td>124</td>
                <td>18</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ArchivePage() {
  return (
    <>
      <h1 className="page-title">Photos & Archive</h1>
      <p className="page-subtitle">Permanent visual records by memorial.</p>

      <div className="grid-3">
        <div className="photo-card">Before</div>
        <div className="photo-card">After</div>
        <div className="photo-card">Comparison</div>
      </div>
    </>
  );
}

function ReportsPage() {
  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Operational and revenue insights.</p>

      <div className="grid-2">
        <div className="card">Revenue by Service Type</div>
        <div className="card">Maintenance Retention</div>
      </div>
    </>
  );
}

function SettingsPage() {
  return null;
}

function UsersAdminPage({
  onCreateUser,
  userManagementFeedback,
  customerAccounts,
  employeeAccounts
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerError, setCustomerError] = useState('');

  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeError, setEmployeeError] = useState('');

  const combinedUsers = useMemo(() => {
    const customers = (customerAccounts || []).map((account) => ({
      ...account,
      userType: 'Customer'
    }));

    const employees = (employeeAccounts || []).map((account) => ({
      ...account,
      userType: 'Employee'
    }));

    return [...customers, ...employees].sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    });
  }, [customerAccounts, employeeAccounts]);

  function submitCreateUser(userType) {
    const isCustomer = userType === 'customer';
    const name = (isCustomer ? customerName : employeeName).trim();
    const email = (isCustomer ? customerEmail : employeeEmail).trim();
    const setError = isCustomer ? setCustomerError : setEmployeeError;
    const resetForm = isCustomer
      ? () => {
        setCustomerName('');
        setCustomerEmail('');
      }
      : () => {
        setEmployeeName('');
        setEmployeeEmail('');
      };

    if (!name || !email) {
      setError('Name and email are required.');
      return;
    }

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) {
      setError('Enter a valid email address.');
      return;
    }

    const result = onCreateUser({
      userType,
      name,
      email
    });

    if (!result || result.error) {
      setError(result && result.error ? result.error : 'Unable to create user.');
      return;
    }

    setError('');
    resetForm();
  }

  return (
    <>
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">Create and manage customer and employee user accounts.</p>

      {userManagementFeedback && (
        <div className="card form-success">
          <strong>User Created</strong>
          <p>{userManagementFeedback.userType} account for {userManagementFeedback.name} ({userManagementFeedback.email}).</p>
          <p>Temporary password: <strong>{userManagementFeedback.tempPassword}</strong></p>
          <p>User must reset password at first login.</p>
        </div>
      )}

      <section className="grid-equal">
        <div className="card form">
          <h3>Create Customer User</h3>
          {customerError && <p className="form-error">{customerError}</p>}

          <label>Customer Name *</label>
          <input
            type="text"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Full name"
          />

          <label>Customer Email *</label>
          <input
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="name@example.com"
          />

          <button
            type="button"
            className="primary-btn"
            onClick={() => submitCreateUser('customer')}
          >
            Create Customer
          </button>
        </div>

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

          <button
            type="button"
            className="primary-btn"
            onClick={() => submitCreateUser('employee')}
          >
            Create Employee
          </button>
        </div>
      </section>

      <div className="card">
        <h3>All Users</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>User Type</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {combinedUsers.length === 0 ? (
                <tr>
                  <td colSpan="5">No users created yet.</td>
                </tr>
              ) : (
                combinedUsers.map((account) => (
                  <tr key={`${account.userType}-${account.email}`}>
                    <td>{account.name || '-'}</td>
                    <td>{account.email}</td>
                    <td>{account.userType}</td>
                    <td>{account.mustResetPassword ? 'Reset Required' : 'Active'}</td>
                    <td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}</td>
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
  const [memorialSearch, setMemorialSearch] = useState('');
  const [cemetery, setCemetery] = useState('');
  const [serviceType, setServiceType] = useState('Initial Restoration');
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
      memorialSearch: memorialSearch.trim(),
      cemetery: cemetery.trim(),
      serviceType
    });

    if (!result || result.error) {
      setErrorMessage(result && result.error ? result.error : 'Unable to create service.');
      return;
    }

    setErrorMessage('');
    setCustomerName('');
    setCustomerEmail('');
    setMemorialSearch('');
    setCemetery('');
    setServiceType('Initial Restoration');
  }

  return (
    <>
      <h1 className="page-title">Onboarding</h1>
      <p className="page-subtitle">Add a new customer and memorial.</p>

      {onboardingFeedback && (
        <div className="card form-success">
          <strong>Service Created</strong>
          <p>Customer account created for {onboardingFeedback.name} ({onboardingFeedback.email}).</p>
          <p>Temporary password: <strong>{onboardingFeedback.tempPassword}</strong></p>
          <p>The customer must reset their password at first login.</p>
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

        <button type="submit" className="primary-btn">Create Service</button>
      </form>
    </>
  );
}

function EmployeeDashboardPage() {
  return (
    <>
      <h1 className="page-title">Crew Dashboard</h1>
      <p className="page-subtitle">Today's assignments, status updates, and photo tasks.</p>

      <section className="grid-2">
        <div className="card">
          <h3>Next Service</h3>
          <p>Smith Family Headstone</p>
          <div className="meta">9:00 AM &middot; Greenwood Cemetery</div>
          <button className="primary-btn">View Route</button>
        </div>
        <div className="card">
          <h3>Task Queue</h3>
          <ul className="service-list">
            <li>
              <strong>Photo Uploads</strong>
              <span>2 pending</span>
              <div className="meta">Due today</div>
            </li>
            <li>
              <strong>Maintenance Checks</strong>
              <span>3 scheduled</span>
              <div className="meta">This week</div>
            </li>
          </ul>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Upcoming Stops</h3>
          <ul className="service-list">
            <li>
              <strong>Jones Memorial</strong>
              <span>Oakwood Memorial Park</span>
              <div className="meta">10:30 AM &middot; Crew B</div>
            </li>
            <li>
              <strong>Thompson Headstone</strong>
              <span>Hillcrest Cemetery</span>
              <div className="meta">11:00 AM &middot; Crew C</div>
            </li>
          </ul>
        </div>
        <div className="card">
          <h3>Safety Notes</h3>
          <p>Wet conditions at Greenwood. Bring slip mats.</p>
        </div>
      </section>
    </>
  );
}

function EmployeeSchedulingPage() {
  return (
    <>
      <h1 className="page-title">My Schedule</h1>
      <p className="page-subtitle">Crew assignments and upcoming services.</p>

      <div className="card">
        <h3>Service Calendar</h3>
        <div className="calendar-placeholder">Calendar view goes here</div>
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
  const [selectedAdminCustomerEmail, setSelectedAdminCustomerEmail] = useState('');
  const [customerSessionEmail, setCustomerSessionEmail] = useState(loadCustomerSession);
  const [customerResetEmail, setCustomerResetEmail] = useState('');
  const [customerViewBypassAuth, setCustomerViewBypassAuth] = useState(false);
  const [onboardingFeedback, setOnboardingFeedback] = useState(null);
  const [userManagementFeedback, setUserManagementFeedback] = useState(null);
  const { role, page, config, canonicalPath, view } = useMemo(() => parseRoute(path), [path]);
  const isLoginView = view === 'login';
  const testingView = isLoginView ? 'login' : role;

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
  const selectedAdminCustomer = useMemo(() => {
    const normalizedEmail = normalizeEmail(selectedAdminCustomerEmail);
    if (!normalizedEmail) return null;
    return adminCustomers.find((customer) => customer.email === normalizedEmail) || null;
  }, [adminCustomers, selectedAdminCustomerEmail]);
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

  function createManagedUser({ userType, name, email, extraFields }) {
    const normalizedType = userType === 'employee' ? 'employee' : 'customer';
    const normalizedName = (name || '').trim();
    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();

    if (!normalizedName || !normalizedEmail) {
      return { error: 'Name and email are required.' };
    }

    const temporaryPassword = generateTempPassword();
    const isEmployee = normalizedType === 'employee';
    const currentAccounts = isEmployee ? employeeAccounts : customerAccounts;
    const existingAccount = currentAccounts.find((account) => account.email === normalizedEmail);

    const nextAccount = {
      email: normalizedEmail,
      name: normalizedName,
      password: temporaryPassword,
      mustResetPassword: true,
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

    queueTempPasswordEmail({
      email: normalizedEmail,
      name: normalizedName,
      temporaryPassword,
      userType: normalizedType
    });

    return {
      ok: true,
      userType: normalizedType,
      name: normalizedName,
      email: normalizedEmail,
      tempPassword: temporaryPassword
    };
  }

  function handleCreateService(payload) {
    const result = createManagedUser({
      userType: 'customer',
      name: payload.customerName,
      email: payload.customerEmail,
      extraFields: {
        serviceType: payload.serviceType || 'Initial Restoration'
      }
    });

    if (!result || result.error) {
      return result || { error: 'Unable to create service.' };
    }

    setOnboardingFeedback({
      name: result.name,
      email: result.email,
      tempPassword: result.tempPassword
    });

    return { ok: true };
  }

  function handleCreateUser(payload) {
    const result = createManagedUser({
      userType: payload.userType,
      name: payload.name,
      email: payload.email
    });

    if (!result || result.error) {
      return result || { error: 'Unable to create user.' };
    }

    setUserManagementFeedback({
      userType: result.userType === 'employee' ? 'Employee' : 'Customer',
      name: result.name,
      email: result.email,
      tempPassword: result.tempPassword
    });

    return { ok: true };
  }

  function handleCustomerLogin({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const account = customerAccounts.find((candidate) => candidate.email === normalizedEmail);

    if (!account || account.password !== password) {
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
        userManagementFeedback={userManagementFeedback}
        customerAccounts={customerAccounts}
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
