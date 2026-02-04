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

const ROUTES = {
  admin: {
    dashboard: DashboardPage,
    memorials: MemorialsPage,
    scheduling: SchedulingPage,
    customers: CustomersPage,
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
    canonicalPath: `${config.basePath}/${page}`
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

function CustomersPage() {
  return (
    <>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Client records and associated memorials.</p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Memorials</th>
              <th>Active Plan</th>
              <th>Last Contact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sarah Johnson</td>
              <td>2</td>
              <td>Annual Maintenance</td>
              <td>09/15/23</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function CemeteriesPage() {
  return (
    <>
      <h1 className="page-title">Cemeteries</h1>
      <p className="page-subtitle">Service locations and memorial distribution.</p>

      <div className="card">
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

function OnboardingPage() {
  return (
    <>
      <h1 className="page-title">Onboarding</h1>
      <p className="page-subtitle">Add a new customer and memorial.</p>

      <div className="card form">
        <label>Search Memorial (GPS / BillionGraves)</label>
        <input type="text" placeholder="Search by name, cemetery, or GPS" />

        <label>Cemetery</label>
        <input type="text" />

        <label>Service Type</label>
        <select>
          <option>Initial Restoration</option>
          <option>Maintenance Plan</option>
        </select>

        <button className="primary-btn">Continue</button>
      </div>
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

function Layout({ role, navItems, currentPath, onRoleChange, children }) {
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

  return (
    <>
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
              className={`nav-item${item.to === currentPath ? ' active' : ''}`}
              href={`#${item.to}`}
              onClick={handleCloseMenu}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="hamburger"
            aria-label="Toggle navigation"
            aria-expanded={isSidebarOpen}
            onClick={handleToggleMenu}
          >
            <span className="bar"></span>
          </button>
          <div className="search">
            <input type="text" placeholder="Search memorials, customers, cemeteries, GPS..." />
          </div>

          <div className="topbar-actions">
            <select
              className="role-select"
              value={role}
              onChange={(event) => onRoleChange(event.target.value)}
            >
              {Object.entries(ROLE_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <div className="bell"></div>
            <button className="primary-btn">New Service</button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      <div className="menu-overlay" onClick={handleCloseMenu}></div>
    </>
  );
}

function App() {
  const [path, navigate] = useHashPath();
  const { role, page, config, canonicalPath } = useMemo(() => parseRoute(path), [path]);

  useEffect(() => {
    if (!canonicalPath) return;
    if (path !== canonicalPath) {
      navigate(canonicalPath);
    }
  }, [canonicalPath, navigate, path]);

  useEffect(() => {
    storeRole(role);
  }, [role]);

  const routeMap = ROUTES[role] || ROUTES.admin;
  const PageComponent = routeMap[page] || routeMap[config.defaultRoute];

  function handleRoleChange(nextRole) {
    const nextConfig = ROLE_CONFIGS[nextRole] || ROLE_CONFIGS.admin;
    navigate(`${nextConfig.basePath}/${nextConfig.defaultRoute}`);
  }

  return (
    <Layout
      role={role}
      navItems={config.nav}
      currentPath={canonicalPath}
      onRoleChange={handleRoleChange}
    >
      <PageComponent />
    </Layout>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}