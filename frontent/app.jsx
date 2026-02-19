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

// All API calls go through the same base so the frontend and Django share origin.
const API_BASE = (window.__API_BASE__ || `${window.location.origin}/api`).replace(/\/+$/, '');

function formatCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function formatDateTimeShort(value) {
  if (!value) return 'Not scheduled';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Not scheduled';
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function useApi(path, defaultValue, enabled = true) {
  const [state, setState] = useState({ loading: true, error: null, data: defaultValue });

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return undefined;

    async function load() {
      try {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        const res = await fetch(`${API_BASE}/${cleanPath}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setState({ loading: false, error: null, data: json });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message || 'Request failed', data: defaultValue });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [path, enabled]);

  return state;
}

function useDashboardData(enabled) {
  const { loading, error, data } = useApi(
    '/dashboard/summary/',
    { summary: null, upcoming_services: [], recent_completed: [] },
    enabled
  );
  return {
    loading,
    error,
    summary: data.summary,
    upcoming: data.upcoming_services,
    recent: data.recent_completed || []
  };
}

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
  const [enabled, setEnabled] = useState(false);
  const { loading, error, summary, upcoming, recent } = useDashboardData(enabled);

  const stats = [
    {
      label: 'Total Revenue',
      value: summary ? formatCurrency(summary.total_revenue || 0) : '—',
      sub: summary ? 'Live total' : 'Awaiting data'
    },
    {
      label: 'Active Services',
      value: summary?.active_services ?? '—',
      sub: summary ? `${summary.services_today} scheduled today` : 'Awaiting data'
    },
    {
      label: 'Crews Active',
      value: summary?.crews_active ?? '—',
      sub: summary ? 'Currently in field' : 'Awaiting data'
    },
    {
      label: 'Completion Rate',
      value: summary ? formatPercent(summary.completion_rate || 0) : '—',
      sub: summary ? 'Last 30 days' : 'Awaiting data'
    }
  ];

  const upcomingServices = (upcoming && upcoming.length)
    ? upcoming.map((svc) => ({
      id: svc.id,
      title: svc.memorial_name || `Service #${svc.id}`,
      cemetery: svc.cemetery_name || 'Scheduled location',
      meta: `${formatDateTimeShort(svc.scheduled_start)} · ${svc.status_display || svc.status || 'Scheduled'}`
    }))
    : [];

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Overview of restoration activity, revenue, and scheduling.</p>

      {!enabled && (
        <div className="card">
          <p className="meta">Dashboard data is paused.</p>
          <button className="primary-btn" onClick={() => setEnabled(true)}>Load dashboard data</button>
        </div>
      )}

      {enabled && error && <div className="card warn">Backend error: {error}</div>}

      <section className="kpis">
        {stats.map((stat) => (
          <div key={stat.label} className="kpi">
            <span className="kpi-label">{stat.label}</span>
            <strong>{stat.value}</strong>
            <small className={stat.label === 'Total Revenue' ? 'positive' : ''}>{stat.sub}</small>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <button className="ghost-btn">View Calendar</button>
          </div>

          {loading && <p className="meta">Loading from backend...</p>}
          {!loading && upcomingServices.length === 0 && <p className="meta">No upcoming services scheduled.</p>}
          {!loading && upcomingServices.length > 0 && (
            <ul className="service-list">
              {upcomingServices.map((svc) => (
                <li key={svc.id}>
                  <strong>{svc.title}</strong>
                  <span>{svc.cemetery}</span>
                  <div className="meta">{svc.meta}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Monthly Revenue</h3>
          <div className="chart-placeholder">Connect chart component</div>
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
            {loading && <tr><td colSpan="4" className="meta">Loading...</td></tr>}
            {!loading && recent.length === 0 && <tr><td colSpan="4" className="meta">No completed services yet.</td></tr>}
            {!loading && recent.map((svc) => (
              <tr key={svc.id}>
                <td>{svc.memorial_name}</td>
                <td>{svc.cemetery_name || '—'}</td>
                <td>{svc.completed_date || '—'}</td>
                <td>{svc.amount != null ? formatCurrency(Number(svc.amount)) : '—'}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Photo Archive Status</h3>
          <p className="meta">No photo metrics yet. Connect a photos endpoint to show status.</p>
        </div>
      </section>
    </>
  );
}

function MemorialsPage() {
  const { loading, error, data } = useApi('/memorials/', []);

  return (
    <>
      <h1 className="page-title">Memorials</h1>
      <p className="page-subtitle">Permanent records of restored and maintained memorials.</p>

      {error && <div className="card warn">Backend error: {error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Cemetery</th>
              <th>Last Service</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="4" className="meta">Loading...</td></tr>
            )}
            {!loading && data.length === 0 && (
              <tr><td colSpan="4" className="meta">No memorials yet.</td></tr>
            )}
            {!loading && data.map((row) => (
              <tr key={row.id}>
                <td>{row.customer}</td>
                <td>{row.cemetery || '—'}</td>
                <td>{row.last_service_date || '—'}</td>
                <td><span className="tag">{row.last_service_status || 'N/A'}</span></td>
              </tr>
            ))}
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
      <div className="card"><p className="meta">Connect a calendar endpoint to display schedule.</p></div>
    </>
  );
}

function CustomersPage() {
  const { loading, error, data } = useApi('/customers/', []);

  return (
    <>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Client records and associated memorials.</p>

      {error && <div className="card warn">Backend error: {error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Memorials</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="meta">Loading...</td></tr>}
            {!loading && data.length === 0 && <tr><td colSpan="5" className="meta">No customers yet.</td></tr>}
            {!loading && data.map((c) => (
              <tr key={c.id}>
                <td>{c.full_name}</td>
                <td>{c.memorials_count || 0}</td>
                <td>{c.email || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.last_contact || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CemeteriesPage() {
  const { loading, error, data } = useApi('/cemeteries/', []);

  return (
    <>
      <h1 className="page-title">Cemeteries</h1>
      <p className="page-subtitle">Service locations and memorial distribution.</p>

      {error && <div className="card warn">Backend error: {error}</div>}

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
            {loading && <tr><td colSpan="4" className="meta">Loading...</td></tr>}
            {!loading && data.length === 0 && <tr><td colSpan="4" className="meta">No cemeteries yet.</td></tr>}
            {!loading && data.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.city || '—'}</td>
                <td>{c.memorials_count || 0}</td>
                <td>{c.active_services || 0}</td>
              </tr>
            ))}
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
      <div className="card"><p className="meta">No photos to display. Integrate photo list API.</p></div>
    </>
  );
}

function ReportsPage() {
  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Operational and revenue insights.</p>
      <div className="card"><p className="meta">Hook up reporting endpoints to show charts.</p></div>
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
      <div className="card"><p className="meta">No crew data yet. Connect crew/assignment API.</p></div>
    </>
  );
}

function EmployeeSchedulingPage() {
  return (
    <>
      <h1 className="page-title">My Schedule</h1>
      <p className="page-subtitle">Crew assignments and upcoming services.</p>

      <div className="card"><p className="meta">No schedule data yet.</p></div>
    </>
  );
}

function CustomerDashboardPage() {
  return (
    <>
      <h1 className="page-title">Customer Overview</h1>
      <p className="page-subtitle">Your memorials, service history, and upcoming visits.</p>
      <div className="card"><p className="meta">No customer dashboard data yet.</p></div>
    </>
  );
}

function CustomerMemorialsPage() {
  return (
    <>
      <h1 className="page-title">My Memorials</h1>
      <p className="page-subtitle">Active memorials under your care plan.</p>

      <div className="card"><p className="meta">No memorials for this customer yet.</p></div>
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
