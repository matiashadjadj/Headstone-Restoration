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
      { id: 'emails', label: 'Emails', to: '/admin/emails' },
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

function formatDateOnly(value) {
  if (!value) return 'Unscheduled';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Unscheduled';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInputValue(value = new Date()) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDatetimeLocalInput(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const tzOffsetMs = dt.getTimezoneOffset() * 60 * 1000;
  const local = new Date(dt.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

const SCHEDULING_DATE_KEY = 'hs_scheduling_calendar_date';

function getStoredSchedulingDate() {
  try {
    const value = localStorage.getItem(SCHEDULING_DATE_KEY);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
  } catch (err) {
    // ignore storage errors
  }
  return toDateInputValue(new Date());
}

function parseCoordinate(rawValue, kind) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { ok: false, error: `Missing ${kind === 'lat' ? 'latitude' : 'longitude'}.` };

  const upper = raw.toUpperCase();
  const hasSouthOrWest = /[SW]/.test(upper);
  const hasNorthOrEast = /[NE]/.test(upper);

  // Allow inputs such as: "40.730610", "40.730610 N", "40.730610° N"
  const numberMatch = upper.match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) {
    return { ok: false, error: `Invalid ${kind === 'lat' ? 'latitude' : 'longitude'} format.` };
  }

  let value = Number(numberMatch[0]);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Invalid ${kind === 'lat' ? 'latitude' : 'longitude'} value.` };
  }

  if (hasSouthOrWest) value = -Math.abs(value);
  if (hasNorthOrEast) value = Math.abs(value);

  const min = kind === 'lat' ? -90 : -180;
  const max = kind === 'lat' ? 90 : 180;
  if (value < min || value > max) {
    return {
      ok: false,
      error: `${kind === 'lat' ? 'Latitude' : 'Longitude'} must be between ${min} and ${max}.`
    };
  }

  return { ok: true, value: Number(value.toFixed(6)) };
}

function useApi(path, defaultValue, enabled = true, options = {}) {
  const refreshEvent = options.refreshEvent || '';
  const [state, setState] = useState({ loading: true, error: null, data: defaultValue });
  const [reloadToken, setReloadToken] = useState(0);

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
  }, [path, enabled, reloadToken]);

  useEffect(() => {
    if (!refreshEvent) return undefined;
    function handleRefresh() {
      setReloadToken((value) => value + 1);
    }
    window.addEventListener(refreshEvent, handleRefresh);
    return () => window.removeEventListener(refreshEvent, handleRefresh);
  }, [refreshEvent]);

  return state;
}

function useDashboardData(enabled) {
  const { loading, error, data } = useApi(
    '/dashboard/summary/',
    { summary: null, upcoming_services: [], recent_completed: [] },
    enabled,
    { refreshEvent: 'hs:schedule-updated' }
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
    emails: EmailsPage,
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

const SERVICE_TYPE_OPTIONS = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'reset', label: 'Reset' },
  { value: 'leveling', label: 'Leveling' },
  { value: 'repair', label: 'Repair' },
  { value: 'engraving', label: 'Engraving' },
  { value: 'other', label: 'Other' }
];

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
  const [enabled] = useState(true);
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
  const servicesState = useApi('/scheduling/services/', []);
  const techState = useApi('/technicians/', []);
  const memorialState = useApi('/memorials/', []);

  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('90');
  const [gpsLat, setGpsLat] = useState('');
  const [gpsLng, setGpsLng] = useState('');
  const [calendarDate, setCalendarDate] = useState(getStoredSchedulingDate);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const [createMemorialId, setCreateMemorialId] = useState('');
  const [createServiceType, setCreateServiceType] = useState('cleaning');
  const [createState, setCreateState] = useState({ loading: false, error: '', success: '' });

  useEffect(() => {
    setServices(Array.isArray(servicesState.data) ? servicesState.data : []);
  }, [servicesState.data]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULING_DATE_KEY, calendarDate);
    } catch (err) {
      // ignore storage errors
    }
  }, [calendarDate]);

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === String(selectedServiceId)) || null,
    [services, selectedServiceId]
  );

  useEffect(() => {
    if (!services.length) return;
    if (selectedServiceId && selectedService) return;

    const preferred = services.find((s) => s.status === 'draft') || services[0];
    setSelectedServiceId(String(preferred.id));
    setTechnicianId(preferred.technician_id ? String(preferred.technician_id) : '');
    setScheduledStart(toDatetimeLocalInput(preferred.scheduled_start));
    setEstimatedMinutes(preferred.estimated_minutes ? String(preferred.estimated_minutes) : '90');
    setGpsLat(preferred.gps_lat != null ? String(preferred.gps_lat) : '');
    setGpsLng(preferred.gps_lng != null ? String(preferred.gps_lng) : '');
  }, [services, selectedServiceId, selectedService]);

  useEffect(() => {
    if (!services.length) return;
    const hasAnyOnSelectedDate = services.some(
      (svc) => svc.scheduled_start && toDateInputValue(svc.scheduled_start) === calendarDate
    );
    if (hasAnyOnSelectedDate) return;

    const firstScheduled = services.find((svc) => Boolean(svc.scheduled_start));
    if (firstScheduled) {
      setCalendarDate(toDateInputValue(firstScheduled.scheduled_start));
    }
  }, [services, calendarDate]);

  function syncFormFromService(serviceId) {
    const svc = services.find((item) => String(item.id) === String(serviceId));
    if (!svc) return;
    setSelectedServiceId(String(svc.id));
    setTechnicianId(svc.technician_id ? String(svc.technician_id) : '');
    setScheduledStart(toDatetimeLocalInput(svc.scheduled_start));
    setEstimatedMinutes(svc.estimated_minutes ? String(svc.estimated_minutes) : '90');
    setGpsLat(svc.gps_lat != null ? String(svc.gps_lat) : '');
    setGpsLng(svc.gps_lng != null ? String(svc.gps_lng) : '');
    setSubmitState({ loading: false, error: '', success: '' });
  }

  async function handleAssign(event) {
    event.preventDefault();
    setSubmitState({ loading: true, error: '', success: '' });

    if (!selectedServiceId) {
      setSubmitState({ loading: false, error: 'Select a job to schedule.', success: '' });
      return;
    }
    if (!technicianId) {
      setSubmitState({ loading: false, error: 'Select a technician.', success: '' });
      return;
    }
    if (!scheduledStart) {
      setSubmitState({ loading: false, error: 'Pick a scheduled start time.', success: '' });
      return;
    }

    const gpsLatValue = gpsLat.trim();
    const gpsLngValue = gpsLng.trim();
    if ((gpsLatValue && !gpsLngValue) || (!gpsLatValue && gpsLngValue)) {
      setSubmitState({ loading: false, error: 'Provide both GPS latitude and longitude.', success: '' });
      return;
    }

    const payload = {
      technician_id: Number(technicianId),
      scheduled_start: datetimeLocalToIso(scheduledStart),
      estimated_minutes: Number(estimatedMinutes) || 90
    };
    if (gpsLatValue && gpsLngValue) {
      const parsedLat = parseCoordinate(gpsLatValue, 'lat');
      const parsedLng = parseCoordinate(gpsLngValue, 'lng');
      if (!parsedLat.ok || !parsedLng.ok) {
        setSubmitState({
          loading: false,
          error: parsedLat.error || parsedLng.error || 'Invalid GPS coordinates.',
          success: ''
        });
        return;
      }
      payload.gps_lat = parsedLat.value;
      payload.gps_lng = parsedLng.value;
    }

    try {
      const res = await fetch(`${API_BASE}/manager/services/${selectedServiceId}/assign/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Assign failed (${res.status})`);
      }
      const json = await res.json();
      if (json.service) {
        setServices((prev) => prev.map((item) => (item.id === json.service.id ? json.service : item)));
        setCalendarDate(toDateInputValue(json.service.scheduled_start || new Date()));
        syncFormFromService(json.service.id);
      }
      window.dispatchEvent(new Event('hs:schedule-updated'));
      setSubmitState({ loading: false, error: '', success: 'Schedule saved.' });
    } catch (err) {
      setSubmitState({ loading: false, error: err.message || 'Failed to save schedule.', success: '' });
    }
  }

  async function handleCreateJob(event) {
    event.preventDefault();
    setCreateState({ loading: true, error: '', success: '' });
    if (!createMemorialId) {
      setCreateState({ loading: false, error: 'Select a memorial.', success: '' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/scheduling/services/create/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memorial_id: Number(createMemorialId),
          service_type: createServiceType
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create failed (${res.status})`);
      }
      const json = await res.json();
      if (json.service) {
        setServices((prev) => [json.service, ...prev]);
        syncFormFromService(json.service.id);
      }
      setCreateState({ loading: false, error: '', success: 'Job created. Now assign it below.' });
    } catch (err) {
      setCreateState({ loading: false, error: err.message || 'Failed to create job.', success: '' });
    }
  }

  const scheduledForDay = useMemo(() => {
    return services
      .filter((svc) => svc.scheduled_start && toDateInputValue(svc.scheduled_start) === calendarDate)
      .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
  }, [services, calendarDate]);

  const unscheduledCount = useMemo(
    () => services.filter((svc) => !svc.scheduled_start || svc.status === 'draft').length,
    [services]
  );

  return (
    <>
      <h1 className="page-title">Scheduling</h1>
      <p className="page-subtitle">Assign technicians, set GPS coordinates, and schedule restoration jobs.</p>

      {(servicesState.error || techState.error || memorialState.error) && (
        <div className="card warn">
          Backend error: {servicesState.error || techState.error || memorialState.error}
        </div>
      )}

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Jobs Loaded</span>
          <strong>{services.length}</strong>
          <small>{servicesState.loading ? 'Loading...' : 'From scheduling API'}</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Unscheduled</span>
          <strong>{unscheduledCount}</strong>
          <small>Needs admin assignment</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Technicians</span>
          <strong>{Array.isArray(techState.data) ? techState.data.length : 0}</strong>
          <small>Active tech accounts</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Calendar Date</span>
          <strong>{calendarDate || '—'}</strong>
          <small>{scheduledForDay.length} jobs on selected day</small>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Calendar</h3>
            <input
              type="date"
              value={calendarDate}
              onChange={(event) => setCalendarDate(event.target.value)}
            />
          </div>
          {scheduledForDay.length === 0 && <p className="meta">No jobs scheduled for this date.</p>}
          {scheduledForDay.length > 0 && (
            <ul className="service-list">
              {scheduledForDay.map((svc) => (
                <li key={svc.id}>
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">
                    {formatDateTimeShort(svc.scheduled_start)} · {svc.technician_name || 'Unassigned'} · {svc.estimated_minutes || 0} min
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Create Job</h3>
          <form className="form" onSubmit={handleCreateJob}>
            <label>Memorial</label>
            <select
              value={createMemorialId}
              onChange={(event) => setCreateMemorialId(event.target.value)}
              required
            >
              <option value="">Select memorial</option>
              {(memorialState.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.id} · {m.customer || 'Customer'} · {m.cemetery || 'Cemetery'}
                </option>
              ))}
            </select>

            <label>Service Type</label>
            <select
              value={createServiceType}
              onChange={(event) => setCreateServiceType(event.target.value)}
            >
              {SERVICE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {createState.error && <div className="form-error">{createState.error}</div>}
            {createState.success && <div className="card form-success"><strong>{createState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={createState.loading || memorialState.loading}>
              {createState.loading ? 'Creating...' : 'Create Job'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Assign Technician</h3>
          <form className="form" onSubmit={handleAssign}>
            <label>Job</label>
            <select
              value={selectedServiceId}
              onChange={(event) => syncFormFromService(event.target.value)}
              required
            >
              <option value="">Select a job</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  #{svc.id} · {svc.memorial_name || 'Memorial'} · {svc.status}
                </option>
              ))}
            </select>

            <label>Technician</label>
            <select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
              required
            >
              <option value="">Select technician</option>
              {(techState.data || []).map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.full_name}</option>
              ))}
            </select>

            <label>Start Time</label>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              required
            />

            <label>Estimated Minutes</label>
            <input
              type="number"
              min="1"
              max="1440"
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              required
            />

            <label>GPS Latitude</label>
            <input
              type="text"
              placeholder="e.g. 40.730610 or 40.730610 N"
              value={gpsLat}
              onChange={(event) => setGpsLat(event.target.value)}
            />

            <label>GPS Longitude</label>
            <input
              type="text"
              placeholder="e.g. -73.935242 or 73.935242 W"
              value={gpsLng}
              onChange={(event) => setGpsLng(event.target.value)}
            />

            {submitState.error && <div className="form-error">{submitState.error}</div>}
            {submitState.success && <div className="card form-success"><strong>{submitState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={submitState.loading}>
              {submitState.loading ? 'Saving...' : 'Save Schedule'}
            </button>
          </form>
        </div>
      </section>

      <div className="card">
        <h3>All Jobs</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Memorial</th>
                <th>Cemetery</th>
                <th>Status</th>
                <th>When</th>
                <th>Technician</th>
                <th>GPS</th>
              </tr>
            </thead>
            <tbody>
              {servicesState.loading && (
                <tr><td colSpan="7" className="meta">Loading jobs...</td></tr>
              )}
              {!servicesState.loading && services.length === 0 && (
                <tr><td colSpan="7" className="meta">No jobs found. Create services in Django admin first.</td></tr>
              )}
              {!servicesState.loading && services.map((svc) => (
                <tr
                  key={svc.id}
                  className="clickable-row"
                  onClick={() => syncFormFromService(svc.id)}
                >
                  <td>#{svc.id}</td>
                  <td>{svc.memorial_name || '—'}</td>
                  <td>{svc.cemetery_name || '—'}</td>
                  <td><span className="tag">{svc.status || '—'}</span></td>
                  <td>{formatDateTimeShort(svc.scheduled_start)}</td>
                  <td>{svc.technician_name || 'Unassigned'}</td>
                  <td>
                    {svc.gps_lat != null && svc.gps_lng != null
                      ? `${svc.gps_lat}, ${svc.gps_lng}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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

function EmailsPage() {
  const customerState = useApi('/customers/', []);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [subject, setSubject] = useState('Service update for {{client_name}}');
  const [body, setBody] = useState(
    'Hello {{client_name}},\n\n'
    + 'This is an update from Headstone Restoration regarding your memorial service.\n'
    + 'We will follow up with your scheduling details shortly.\n\n'
    + 'Best regards,\n'
    + 'Headstone Restoration'
  );
  const [sendState, setSendState] = useState({ loading: false, error: '', result: null });

  const customersWithEmail = useMemo(
    () => (customerState.data || []).filter((c) => Boolean(c.email)),
    [customerState.data]
  );

  function toggleCustomer(customerId) {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(customerId)) return prev.filter((id) => id !== customerId);
      return [...prev, customerId];
    });
  }

  function selectAll() {
    setSelectedCustomerIds(customersWithEmail.map((c) => c.id));
  }

  function clearAll() {
    setSelectedCustomerIds([]);
  }

  async function handleSend(event) {
    event.preventDefault();
    setSendState({ loading: true, error: '', result: null });

    if (!selectedCustomerIds.length) {
      setSendState({ loading: false, error: 'Select at least one customer.', result: null });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setSendState({ loading: false, error: 'Subject and body are required.', result: null });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/emails/send/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_ids: selectedCustomerIds,
          subject,
          body
        })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || `Send failed (${res.status})`);
      }
      setSendState({ loading: false, error: '', result: json });
    } catch (err) {
      setSendState({ loading: false, error: err.message || 'Failed to send emails.', result: null });
    }
  }

  return (
    <>
      <h1 className="page-title">Email Center</h1>
      <p className="page-subtitle">Send personalized client emails from headstone@restoration.com.</p>

      {customerState.error && <div className="card warn">Backend error: {customerState.error}</div>}

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Recipients</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="ghost-btn" type="button" onClick={selectAll}>Select All</button>
              <button className="ghost-btn" type="button" onClick={clearAll}>Clear</button>
            </div>
          </div>
          <p className="meta">
            {selectedCustomerIds.length} selected / {customersWithEmail.length} with email addresses
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pick</th>
                  <th>Customer</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {customerState.loading && (
                  <tr><td colSpan="3" className="meta">Loading customers...</td></tr>
                )}
                {!customerState.loading && customersWithEmail.length === 0 && (
                  <tr><td colSpan="3" className="meta">No customers with emails found.</td></tr>
                )}
                {!customerState.loading && customersWithEmail.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(customer.id)}
                        onChange={() => toggleCustomer(customer.id)}
                      />
                    </td>
                    <td>{customer.full_name}</td>
                    <td>{customer.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Compose</h3>
          <form className="form" onSubmit={handleSend}>
            <label>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
            />

            <label>Body</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />

            <p className="meta">Tokens: {'{{client_name}}'}, {'{{customer_name}}'}, {'{{first_name}}'}, {'{{email}}'}</p>

            {sendState.error && <div className="form-error">{sendState.error}</div>}
            <button className="primary-btn" type="submit" disabled={sendState.loading}>
              {sendState.loading ? 'Sending...' : 'Send Emails'}
            </button>
          </form>
        </div>
      </section>

      {sendState.result && (
        <div className="card">
          <h3>Send Result</h3>
          <p className="meta">From: {sendState.result.from_email}</p>
          <p className="meta">
            Sent: {sendState.result.sent_count} · Skipped: {sendState.result.skipped_count} · Failed: {sendState.result.failed_count}
          </p>
          {sendState.result.failed_count > 0 && (
            <div className="form-error">Some emails failed. Check backend logs/SMTP configuration.</div>
          )}
        </div>
      )}
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">General application settings.</p>
      <div className="card">
        <p className="meta">Use the Emails section for customer email outreach.</p>
      </div>
    </>
  );
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
