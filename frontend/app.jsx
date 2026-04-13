const { useEffect, useMemo, useRef, useState } = React;

const ROLE_CONFIGS = {
  admin: {
    label: 'Admin',
    basePath: '/admin',
    defaultRoute: 'dashboard',
    nav: [
      { id: 'dashboard', label: 'Dashboard', to: '/admin/dashboard' },
      { id: 'onboarding', label: 'Onboard Customer', to: '/admin/onboarding' },
      { id: 'memorials', label: 'Memorials', to: '/admin/memorials' },
      { id: 'scheduling', label: 'Scheduling', to: '/admin/scheduling' },
      { id: 'users', label: 'Users & Roles', to: '/admin/users' },
      { id: 'customers', label: 'Customers', to: '/admin/customers' },
      { id: 'cemeteries', label: 'Cemeteries', to: '/admin/cemeteries' },
      { id: 'archive', label: 'Photos & Archive', to: '/admin/archive' },
      { id: 'invoices', label: 'Invoices', to: '/admin/invoices' },
      { id: 'emails', label: 'Emails', to: '/admin/emails' },
      { id: 'reports', label: 'Reports', to: '/admin/reports' },
      { id: 'settings', label: 'Settings', to: '/admin/settings' }
    ]
  },
  frontdesk: {
    label: 'Front Desk',
    basePath: '/frontdesk',
    defaultRoute: 'dashboard',
    nav: [
      { id: 'dashboard', label: 'Front Desk', to: '/frontdesk/dashboard' },
      { id: 'onboarding', label: 'Onboard Customer', to: '/frontdesk/onboarding' },
      { id: 'customers', label: 'Customers', to: '/frontdesk/customers' },
      { id: 'memorials', label: 'Memorials', to: '/frontdesk/memorials' },
      { id: 'scheduling', label: 'Scheduling', to: '/frontdesk/scheduling' },
      { id: 'cemeteries', label: 'Cemeteries', to: '/frontdesk/cemeteries' },
      { id: 'emails', label: 'Emails', to: '/frontdesk/emails' },
      { id: 'archive', label: 'Archive', to: '/frontdesk/archive' },
      { id: 'reports', label: 'Reports', to: '/frontdesk/reports' },
      { id: 'settings', label: 'Settings', to: '/frontdesk/settings' }
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
      { id: 'reports', label: 'Reports', to: '/employee/reports' },
      { id: 'settings', label: 'Settings', to: '/employee/settings' }
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
function normalizeApiBase(value) {
  const configured = String(value || '').trim();
  if (!configured) return '';
  if (configured === '/api') return '';
  if (/^https?:\/\/[^/]+\/api\/?$/i.test(configured)) {
    return configured.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  }
  if (/^https?:\/\/[^/]+$/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  return configured.replace(/\/+$/, '');
}

function getApiBase() {
  const configured = normalizeApiBase(window.__API_BASE__);
  if (configured) return configured;
  const { protocol, hostname, origin, port } = window.location;
  const isHttp = protocol === 'http:' || protocol === 'https:';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (isLocalHost && port !== '8000') return 'http://127.0.0.1:8000';
  if (isHttp) return origin.replace(/\/$/, '');
  return '';
}

const API_BASE = getApiBase();

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(';') : [];
  const needle = `${name}=`;
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(needle)) {
      return decodeURIComponent(cookie.slice(needle.length));
    }
  }
  return '';
}

async function apiFetch(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
  }

  return fetch(`${API_BASE}/api${normalizedPath}`, {
    ...options,
    method,
    credentials: 'include',
    headers
  });
}

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

function copyTextToClipboard(value) {
  const text = String(value || '');
  if (!text) return Promise.reject(new Error('Nothing to copy.'));
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', 'readonly');
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  return Promise.resolve();
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
const FULLCALENDAR = window.FullCalendar || null;

function getStoredSchedulingDate() {
  try {
    const value = localStorage.getItem(SCHEDULING_DATE_KEY);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
  } catch (err) {
    // ignore storage errors
  }
  return toDateInputValue(new Date());
}

function buildScheduleEvent(service) {
  if (!service?.scheduled_start) return null;
  const start = new Date(service.scheduled_start);
  if (Number.isNaN(start.getTime())) return null;

  const durationMinutes = Number(service.estimated_minutes) || 90;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const isDraft = service.status === 'draft';
  const isInProgress = service.status === 'in_progress';

  return {
    id: String(service.id),
    title: service.memorial_name || `Service #${service.id}`,
    start: start.toISOString(),
    end: end.toISOString(),
    classNames: [
      isDraft ? 'fc-event-draft' : '',
      isInProgress ? 'fc-event-progress' : '',
      service.status === 'scheduled' ? 'fc-event-scheduled' : ''
    ].filter(Boolean),
    extendedProps: {
      cemeteryName: service.cemetery_name || 'No cemetery',
      technicianName: service.technician_name || 'Unassigned',
      price: service.price,
      estimatedMinutes: durationMinutes
    }
  };
}

function SchedulingCalendar({ services, calendarDate, onDateChange, onSelectService, selectedServiceId }) {
  const containerRef = React.useRef(null);

  useEffect(() => {
    if (!FULLCALENDAR || !containerRef.current) return undefined;

    const calendar = new FULLCALENDAR.Calendar(containerRef.current, {
      initialView: 'dayGridMonth',
      initialDate: calendarDate,
      events: services.map(buildScheduleEvent).filter(Boolean),
      height: 'auto',
      selectable: true,
      nowIndicator: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        meridiem: 'short'
      },
      dateClick(info) {
        onDateChange(info.dateStr);
      },
      eventClick(info) {
        onDateChange(toDateInputValue(info.event.start || calendarDate));
        onSelectService(info.event.id);
      },
      eventContent(arg) {
        const technicianName = arg.event.extendedProps.technicianName;
        const isSelected = String(selectedServiceId) === String(arg.event.id);

        const wrapper = document.createElement('div');
        wrapper.className = `fc-event-card${isSelected ? ' is-selected' : ''}`;

        const title = document.createElement('div');
        title.className = 'fc-event-title';
        title.textContent = arg.event.title;

        const meta = document.createElement('div');
        meta.className = 'fc-event-meta';
        meta.textContent = technicianName;

        wrapper.appendChild(title);
        wrapper.appendChild(meta);
        return { domNodes: [wrapper] };
      }
    });

    calendar.render();
    return () => calendar.destroy();
  }, [services, calendarDate, onDateChange, onSelectService, selectedServiceId]);

  if (!FULLCALENDAR) {
    return <p className="meta">Calendar library failed to load.</p>;
  }

  return (
    <div className="fullcalendar-shell">
      <div ref={containerRef}></div>
    </div>
  );
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

function formatApiError(payload, fallbackMessage) {
  if (!payload) return fallbackMessage;
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    const first = payload.find(Boolean);
    return first ? String(first) : fallbackMessage;
  }
  if (typeof payload === 'object') {
    if (payload.detail) return String(payload.detail);
    for (const value of Object.values(payload)) {
      const message = formatApiError(value, '');
      if (message) return message;
    }
  }
  return fallbackMessage;
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
        const res = await apiFetch(path);
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

const WORKFLOW_STORE_KEY = 'hs_frontend_workflow_store_v1';
const ONBOARDING_DRAFT_KEY = 'hs_frontend_onboarding_draft_v1';

const MATERIAL_OPTIONS = [
  { value: 'granite', label: 'Granite' },
  { value: 'marble', label: 'Marble' },
  { value: 'limestone', label: 'Limestone' },
  { value: 'sandstone', label: 'Sandstone' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'other', label: 'Other / TBD' }
];

function createEmptyWorkflowStore() {
  return {
    customerMeta: {},
    cemeteryMeta: {},
    memorialMeta: {},
    localCemeteries: [],
    localMemorials: []
  };
}

function readJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch (err) {
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // ignore storage errors
  }
  return value;
}

function readWorkflowStore() {
  const fallback = createEmptyWorkflowStore();
  const parsed = readJsonStorage(WORKFLOW_STORE_KEY, fallback);
  return {
    ...fallback,
    ...(parsed || {}),
    customerMeta: { ...(parsed?.customerMeta || {}) },
    cemeteryMeta: { ...(parsed?.cemeteryMeta || {}) },
    memorialMeta: { ...(parsed?.memorialMeta || {}) },
    localCemeteries: Array.isArray(parsed?.localCemeteries) ? parsed.localCemeteries : [],
    localMemorials: Array.isArray(parsed?.localMemorials) ? parsed.localMemorials : []
  };
}

function updateWorkflowStore(updater) {
  const current = readWorkflowStore();
  const next = typeof updater === 'function' ? updater(current) : updater;
  writeJsonStorage(WORKFLOW_STORE_KEY, next);
  window.dispatchEvent(new Event('hs:workflow-updated'));
  return next;
}

function saveCustomerMeta(customerId, fields) {
  const key = String(customerId);
  updateWorkflowStore((store) => ({
    ...store,
    customerMeta: {
      ...store.customerMeta,
      [key]: {
        ...(store.customerMeta[key] || {}),
        ...(fields || {})
      }
    }
  }));
}

function saveCemeteryMeta(cemeteryId, fields) {
  const key = String(cemeteryId);
  updateWorkflowStore((store) => ({
    ...store,
    cemeteryMeta: {
      ...store.cemeteryMeta,
      [key]: {
        ...(store.cemeteryMeta[key] || {}),
        ...(fields || {})
      }
    }
  }));
}

function saveMemorialMeta(memorialId, fields) {
  const key = String(memorialId);
  updateWorkflowStore((store) => ({
    ...store,
    memorialMeta: {
      ...store.memorialMeta,
      [key]: {
        ...(store.memorialMeta[key] || {}),
        ...(fields || {})
      }
    }
  }));
}

function upsertLocalCemetery(record) {
  updateWorkflowStore((store) => {
    const nextRows = [...store.localCemeteries];
    const index = nextRows.findIndex((row) => String(row.id) === String(record.id));
    if (index >= 0) {
      nextRows[index] = { ...nextRows[index], ...record };
    } else {
      nextRows.push(record);
    }
    return {
      ...store,
      localCemeteries: nextRows
    };
  });
}

function upsertLocalMemorial(record) {
  updateWorkflowStore((store) => {
    const nextRows = [...store.localMemorials];
    const index = nextRows.findIndex((row) => String(row.id) === String(record.id));
    if (index >= 0) {
      nextRows[index] = { ...nextRows[index], ...record };
    } else {
      nextRows.push(record);
    }
    return {
      ...store,
      localMemorials: nextRows
    };
  });
}

function useWorkflowStore() {
  const [store, setStore] = useState(readWorkflowStore);

  useEffect(() => {
    function handleUpdate() {
      setStore(readWorkflowStore());
    }

    window.addEventListener('hs:workflow-updated', handleUpdate);
    return () => window.removeEventListener('hs:workflow-updated', handleUpdate);
  }, []);

  return store;
}

function readOnboardingDraft() {
  const draft = readJsonStorage(ONBOARDING_DRAFT_KEY, {});
  return draft && typeof draft === 'object' ? draft : {};
}

function saveOnboardingDraft(draft) {
  writeJsonStorage(ONBOARDING_DRAFT_KEY, draft || {});
}

function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch (err) {
    // ignore storage errors
  }
}

function makeLocalId(prefix) {
  return `local-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLookup(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesCustomerRecord(memorial, customer) {
  if (!memorial || !customer) return false;
  if (memorial.customer_id != null && customer.id != null) {
    return String(memorial.customer_id) === String(customer.id);
  }
  return normalizeLookup(memorial.customer) === normalizeLookup(customer.full_name);
}

function matchesCemeteryRecord(memorial, cemetery) {
  if (!memorial || !cemetery) return false;
  if (memorial.cemetery_id != null && cemetery.id != null) {
    return String(memorial.cemetery_id) === String(cemetery.id);
  }
  return normalizeLookup(memorial.cemetery) === normalizeLookup(cemetery.name);
}

function getMaterialLabel(value) {
  const match = MATERIAL_OPTIONS.find((option) => option.value === value);
  return match ? match.label : 'Other / TBD';
}

function buildMergedMemorials(apiMemorials, workflowStore) {
  const store = workflowStore || createEmptyWorkflowStore();
  const apiRows = (Array.isArray(apiMemorials) ? apiMemorials : []).map((row) => {
    const meta = store.memorialMeta[String(row.id)] || {};
    const material = meta.material || 'other';
    const photoNames = Array.isArray(meta.photo_names) ? meta.photo_names : [];
    return {
      ...row,
      source: 'api',
      customer_id: meta.customer_id ?? null,
      cemetery_id: meta.cemetery_id ?? null,
      name_on_stone: meta.name_on_stone || row.customer || '',
      material,
      material_label: getMaterialLabel(material),
      stone_style: meta.stone_style || '',
      has_plaque: Boolean(meta.has_plaque),
      has_paint: Boolean(meta.has_paint),
      decoration_notes: meta.decoration_notes || '',
      location_description: meta.location_description || '',
      age_years: meta.age_years || '',
      previous_cleaning_notes: meta.previous_cleaning_notes || '',
      notes: meta.notes || '',
      photo_names: photoNames,
      regional_team: meta.regional_team || (row.last_service_date ? 'Regional field team' : 'Scheduling team')
    };
  });

  const localRows = (Array.isArray(store.localMemorials) ? store.localMemorials : []).map((row) => {
    const material = row.material || 'other';
    return {
      ...row,
      source: 'local',
      material,
      material_label: getMaterialLabel(material),
      photo_names: Array.isArray(row.photo_names) ? row.photo_names : [],
      regional_team: row.regional_team || 'Regional field team'
    };
  });

  return [...apiRows, ...localRows].sort((a, b) => {
    const customerCompare = String(a.customer || '').localeCompare(String(b.customer || ''));
    if (customerCompare !== 0) return customerCompare;
    return String(a.name_on_stone || a.customer || '').localeCompare(String(b.name_on_stone || b.customer || ''));
  });
}

function buildMergedCustomers(apiCustomers, mergedMemorials, workflowStore) {
  const store = workflowStore || createEmptyWorkflowStore();
  return (Array.isArray(apiCustomers) ? apiCustomers : [])
    .map((customer) => {
      const meta = store.customerMeta[String(customer.id)] || {};
      const memorialsCount = mergedMemorials.filter((memorial) => matchesCustomerRecord(memorial, customer)).length;
      return {
        ...customer,
        ...meta,
        memorials_count: memorialsCount || customer.memorials_count || 0
      };
    })
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
}

function buildMergedCemeteries(apiCemeteries, mergedMemorials, workflowStore) {
  const store = workflowStore || createEmptyWorkflowStore();
  const apiRows = (Array.isArray(apiCemeteries) ? apiCemeteries : []).map((cemetery) => {
    const meta = store.cemeteryMeta[String(cemetery.id)] || {};
    const memorialsCount = mergedMemorials.filter((memorial) => matchesCemeteryRecord(memorial, { ...cemetery, ...meta })).length;
    return {
      ...cemetery,
      ...meta,
      source: 'api',
      memorials_count: memorialsCount || cemetery.memorials_count || 0
    };
  });

  const localRows = (Array.isArray(store.localCemeteries) ? store.localCemeteries : []).map((cemetery) => {
    const memorialsCount = mergedMemorials.filter((memorial) => matchesCemeteryRecord(memorial, cemetery)).length;
    return {
      ...cemetery,
      source: 'local',
      active_services: cemetery.active_services || 0,
      memorials_count: memorialsCount
    };
  });

  return [...apiRows, ...localRows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function buildRevenueChartRows(recentCompleted, scheduledServices) {
  const now = new Date();
  const buckets = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
      label: dt.toLocaleDateString('en-US', { month: 'short' }),
      collected: 0,
      scheduled: 0
    });
  }

  const indexByKey = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));

  (Array.isArray(recentCompleted) ? recentCompleted : []).forEach((row) => {
    const dt = new Date(row.completed_date);
    if (Number.isNaN(dt.getTime())) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!indexByKey[key]) return;
    indexByKey[key].collected += Number(row.amount || 0);
  });

  (Array.isArray(scheduledServices) ? scheduledServices : []).forEach((row) => {
    const dt = new Date(row.scheduled_start);
    if (Number.isNaN(dt.getTime())) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!indexByKey[key]) return;
    indexByKey[key].scheduled += Number(row.price || 0);
  });

  return buckets;
}

function getOnboardingPathForCurrentRole() {
  const normalized = normalizePath(window.location.hash || '');
  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean);
  const role = ROLE_CONFIGS[segments[0]] ? segments[0] : 'frontdesk';
  return `${ROLE_CONFIGS[role].basePath}/onboarding`;
}

function openOnboardingWorkflow(draft = {}) {
  saveOnboardingDraft(draft);
  window.location.hash = getOnboardingPathForCurrentRole();
}

function RevenueSnapshotChart({ rows }) {
  const data = Array.isArray(rows) ? rows : [];
  const maxValue = data.reduce((max, row) => Math.max(max, row.collected || 0, row.scheduled || 0), 0);

  if (!data.length || maxValue <= 0) {
    return <div className="chart-placeholder">Revenue graph will fill in as completed and scheduled jobs accumulate.</div>;
  }

  return (
    <div className="revenue-chart">
      {data.map((row) => (
        <div key={row.key} className="revenue-row">
          <span className="revenue-month">{row.label}</span>
          <div className="revenue-bars">
            <div
              className="revenue-bar collected"
              style={{ width: `${Math.max(12, (row.collected / maxValue) * 100)}%` }}
            >
              {row.collected > 0 ? `Collected ${formatCurrency(row.collected)}` : 'Collected'}
            </div>
            <div
              className="revenue-bar scheduled"
              style={{ width: `${Math.max(12, (row.scheduled / maxValue) * 100)}%` }}
            >
              {row.scheduled > 0 ? `Scheduled ${formatCurrency(row.scheduled)}` : 'Scheduled'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const ROUTES = {
  admin: {
    dashboard: DashboardPage,
    memorials: MemorialsPage,
    scheduling: SchedulingPage,
    users: UsersAdminPage,
    customers: CustomersPage,
    cemeteries: CemeteriesPage,
    archive: ArchivePage,
    invoices: AdminInvoicesPage,
    emails: EmailsPage,
    reports: ReportsPage,
    settings: SettingsPage,
    onboarding: OnboardingPage
  },
  frontdesk: {
    dashboard: FrontDeskDashboardPage,
    onboarding: OnboardingPage,
    customers: CustomersPage,
    memorials: MemorialsPage,
    scheduling: SchedulingPage,
    cemeteries: CemeteriesPage,
    emails: EmailsPage,
    archive: ArchivePage,
    reports: ReportsPage,
    settings: UserSettingsPage
  },
  employee: {
    dashboard: EmployeeDashboardPage,
    scheduling: EmployeeSchedulingPage,
    memorials: MemorialsPage,
    archive: ArchivePage,
    reports: ReportsPage,
    settings: UserSettingsPage
  },
  customer: {
    dashboard: CustomerDashboardPage,
    memorials: CustomerMemorialsPage,
    archive: ArchivePage,
    settings: UserSettingsPage
  }
};

function getServiceTypeLabel(service) {
  return service?.service_type_label || service?.service_type || 'Service';
}

const LOGIN_PATH = '/login';
const SETUP_PASSWORD_PATH = '/setup-password';
const PUBLIC_SURVEY_PREFIX = '/survey/';

function getDefaultPathForRole(role) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.admin;
  return `${config.basePath}/${config.defaultRoute}`;
}

function getInviteToken() {
  const searchParams = new URLSearchParams(window.location.search || '');
  const directToken = (searchParams.get('invite') || '').trim();
  if (directToken) return directToken;

  const hash = String(window.location.hash || '');
  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex === -1) return '';
  const hashParams = new URLSearchParams(hash.slice(hashQueryIndex + 1));
  return (hashParams.get('invite') || '').trim();
}

function getSchedulingPathForCurrentRole() {
  const normalized = normalizePath(window.location.hash || '');
  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean);
  const role = ROLE_CONFIGS[segments[0]] ? segments[0] : 'admin';
  return `${ROLE_CONFIGS[role].basePath}/scheduling`;
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

function parseRoute(path, role) {
  const normalized = normalizePath(path);
  const hasActiveRole = Boolean(role && ROLE_CONFIGS[role]);
  const activeRole = hasActiveRole ? role : 'admin';
  const activeConfig = ROLE_CONFIGS[activeRole] || ROLE_CONFIGS.admin;

  if (normalized === LOGIN_PATH) {
    if (hasActiveRole) {
      return {
        role: activeRole,
        page: activeConfig.defaultRoute,
        config: activeConfig,
        canonicalPath: `${activeConfig.basePath}/${activeConfig.defaultRoute}`
      };
    }
    return {
      role: null,
      page: 'login',
      config: null,
      canonicalPath: LOGIN_PATH
    };
  }
  if (normalized === SETUP_PASSWORD_PATH) {
    return {
      role: null,
      page: 'setup-password',
      config: null,
      canonicalPath: SETUP_PASSWORD_PATH
    };
  }
  if (normalized.startsWith(PUBLIC_SURVEY_PREFIX)) {
    const surveyToken = normalized.slice(PUBLIC_SURVEY_PREFIX.length).split('/').filter(Boolean)[0] || '';
    return {
      role: null,
      page: 'public-survey',
      config: null,
      canonicalPath: surveyToken ? `${PUBLIC_SURVEY_PREFIX}${surveyToken}` : PUBLIC_SURVEY_PREFIX,
      surveyToken
    };
  }

  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean);
  const config = ROLE_CONFIGS[activeRole] || ROLE_CONFIGS.admin;
  const routeMap = ROUTES[activeRole] || ROUTES.admin;
  const rolePrefix = segments[0];
  let page = rolePrefix === activeRole ? segments[1] : config.defaultRoute;

  if (!routeMap[page]) {
    page = config.defaultRoute;
  }

  return {
    role: activeRole,
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
      sub: summary ? 'Completed jobs only' : 'Awaiting data'
    },
    {
      label: 'Projected Revenue',
      value: summary ? formatCurrency(summary.projected_revenue || 0) : '—',
      sub: summary ? 'Scheduled, not completed' : 'Awaiting data'
    },
    {
      label: 'Active Services',
      value: summary?.active_services ?? '—',
      sub: summary ? `${summary.services_today} scheduled today` : 'Awaiting data'
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

  function handleViewCalendar() {
    window.location.hash = getSchedulingPathForCurrentRole();
  }

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
            <small className={stat.label.includes('Revenue') ? 'positive' : ''}>{stat.sub}</small>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <button className="ghost-btn" type="button" onClick={handleViewCalendar}>View Calendar</button>
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

function PublicSurveyPage({ surveyToken }) {
  const [surveyState, setSurveyState] = useState({ loading: true, error: '', data: null });
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const [form, setForm] = useState({
    customer_name: '',
    email: '',
    phone: '',
    cemetery_name: '',
    cemetery_address: '',
    section: '',
    row: '',
    plot_number: '',
    grave_number: '',
    gps_lat: '',
    gps_lng: '',
    locating_notes: '',
    extra_notes: '',
    photo: null
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSurvey() {
      if (!surveyToken) {
        setSurveyState({ loading: false, error: 'Survey link is missing a token.', data: null });
        return;
      }

      try {
        const res = await apiFetch(`/public/surveys/${encodeURIComponent(surveyToken)}/`);
        let payload = null;
        try {
          payload = await res.json();
        } catch (error) {
          payload = null;
        }
        if (!res.ok) throw new Error(formatApiError(payload, `Survey lookup failed (${res.status})`));
        if (!cancelled) setSurveyState({ loading: false, error: '', data: payload });
      } catch (err) {
        if (!cancelled) setSurveyState({ loading: false, error: err.message || 'Failed to load survey.', data: null });
      }
    }

    loadSurvey();
    return () => { cancelled = true; };
  }, [surveyToken]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitState({ loading: true, error: '', success: '' });

    const latValue = String(form.gps_lat || '').trim();
    const lngValue = String(form.gps_lng || '').trim();
    if ((latValue && !lngValue) || (!latValue && lngValue)) {
      setSubmitState({ loading: false, error: 'Enter both GPS fields or leave both blank.', success: '' });
      return;
    }

    let gpsLat = '';
    let gpsLng = '';
    if (latValue && lngValue) {
      const parsedLat = parseCoordinate(latValue, 'lat');
      const parsedLng = parseCoordinate(lngValue, 'lng');
      if (!parsedLat.ok || !parsedLng.ok) {
        setSubmitState({
          loading: false,
          error: parsedLat.error || parsedLng.error || 'Invalid GPS coordinates.',
          success: ''
        });
        return;
      }
      gpsLat = String(parsedLat.value);
      gpsLng = String(parsedLng.value);
    }

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'photo') return;
      payload.append(key, value == null ? '' : String(value));
    });
    payload.set('gps_lat', gpsLat);
    payload.set('gps_lng', gpsLng);
    if (form.photo) payload.append('photo', form.photo);

    try {
      const res = await apiFetch(`/public/surveys/${encodeURIComponent(surveyToken)}/`, {
        method: 'POST',
        body: payload
      });
      let json = null;
      try {
        json = await res.json();
      } catch (error) {
        json = null;
      }
      if (!res.ok) throw new Error(formatApiError(json, `Submit failed (${res.status})`));
      setSurveyState((prev) => ({
        loading: false,
        error: '',
        data: prev.data
          ? { ...prev.data, status: 'submitted', submitted_at: json.submitted_at || new Date().toISOString() }
          : prev.data
      }));
      setSubmitState({ loading: false, error: '', success: 'Your information has been submitted.' });
    } catch (err) {
      setSubmitState({ loading: false, error: err.message || 'Failed to submit survey.', success: '' });
    }
  }

  const survey = surveyState.data;
  const isSubmitted = survey?.status === 'submitted';

  return (
    <div className="public-page-shell">
      <div className="public-page-card">
        <div className="public-page-header">
          <span className="tag">Headstone Restoration</span>
          <h1 className="page-title">Customer Survey</h1>
          <p className="page-subtitle">Please share the location details for this headstone. No login is required.</p>
        </div>

        {surveyState.loading && <p className="meta">Loading survey...</p>}
        {surveyState.error && <div className="form-error">{surveyState.error}</div>}

        {!surveyState.loading && !surveyState.error && survey && (
          <>
            <div className="public-survey-summary">
              <div>
                <strong>Job</strong>
                <span>{survey.service_name || 'Service'}</span>
              </div>
              <div>
                <strong>Cemetery</strong>
                <span>{survey.cemetery_name || 'Not provided yet'}</span>
              </div>
              <div>
                <strong>Status</strong>
                <span>{survey.status || 'pending'}</span>
              </div>
            </div>

            {isSubmitted ? (
              <div className="card form-success">
                <strong>Survey already submitted.</strong>
                <p className="meta">Submitted {formatDateTimeShort(survey.submitted_at)}.</p>
              </div>
            ) : (
              <form className="form" onSubmit={handleSubmit}>
                <label>Name</label>
                <input value={form.customer_name} onChange={(event) => updateField('customer_name', event.target.value)} required />

                <div className="field-row">
                  <div>
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                  </div>
                  <div>
                    <label>Phone</label>
                    <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                  </div>
                </div>

                <label>Cemetery Name</label>
                <input value={form.cemetery_name} onChange={(event) => updateField('cemetery_name', event.target.value)} />

                <label>Cemetery Address</label>
                <input value={form.cemetery_address} onChange={(event) => updateField('cemetery_address', event.target.value)} />

                <div className="field-row field-row-4">
                  <div>
                    <label>Section</label>
                    <input value={form.section} onChange={(event) => updateField('section', event.target.value)} />
                  </div>
                  <div>
                    <label>Row</label>
                    <input value={form.row} onChange={(event) => updateField('row', event.target.value)} />
                  </div>
                  <div>
                    <label>Plot</label>
                    <input value={form.plot_number} onChange={(event) => updateField('plot_number', event.target.value)} />
                  </div>
                  <div>
                    <label>Grave #</label>
                    <input value={form.grave_number} onChange={(event) => updateField('grave_number', event.target.value)} />
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <label>GPS Latitude</label>
                    <input value={form.gps_lat} onChange={(event) => updateField('gps_lat', event.target.value)} placeholder="40.730610" />
                  </div>
                  <div>
                    <label>GPS Longitude</label>
                    <input value={form.gps_lng} onChange={(event) => updateField('gps_lng', event.target.value)} placeholder="-73.935242" />
                  </div>
                </div>
                <p className="meta">Enter both GPS fields together if you have them.</p>

                <label>Notes For Finding The Headstone</label>
                <textarea rows="4" value={form.locating_notes} onChange={(event) => updateField('locating_notes', event.target.value)} />

                <label>Extra Notes</label>
                <textarea rows="4" value={form.extra_notes} onChange={(event) => updateField('extra_notes', event.target.value)} />

                <label>Optional Photo</label>
                <input type="file" accept="image/*" onChange={(event) => updateField('photo', event.target.files?.[0] || null)} />

                {submitState.error && <div className="form-error">{submitState.error}</div>}
                {submitState.success && <div className="card form-success"><strong>{submitState.success}</strong></div>}
                <button className="primary-btn" type="submit" disabled={submitState.loading}>
                  {submitState.loading ? 'Submitting...' : 'Submit Information'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemorialsPage() {
  const memorialState = useApi('/manage/memorials/', [], true, { refreshEvent: 'hs:memorials-updated' });
  const customerState = useApi('/manage/customers/', [], true, { refreshEvent: 'hs:customers-updated' });
  const cemeteryState = useApi('/cemeteries/', []);
  const [memorials, setMemorials] = useState([]);
  const [form, setForm] = useState({
    customer_id: '',
    cemetery_id: '',
    section: '',
    row: '',
    plot_number: '',
    material: 'other',
    notes: ''
  });
  const [saveState, setSaveState] = useState({ loading: false, error: '', success: '' });

  useEffect(() => {
    setMemorials(Array.isArray(memorialState.data) ? memorialState.data : []);
  }, [memorialState.data]);

  async function handleCreate(event) {
    event.preventDefault();
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch('/manage/memorials/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: Number(form.customer_id),
          cemetery_id: Number(form.cemetery_id),
          section: form.section,
          row: form.row,
          plot_number: form.plot_number,
          material: form.material,
          notes: form.notes
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Create failed (${res.status})`));
      setMemorials((prev) => [...prev, json.memorial].sort((a, b) => String(a.customer || '').localeCompare(String(b.customer || ''))));
      setForm({
        customer_id: '',
        cemetery_id: '',
        section: '',
        row: '',
        plot_number: '',
        material: 'other',
        notes: ''
      });
      setSaveState({ loading: false, error: '', success: 'Memorial created.' });
      window.dispatchEvent(new Event('hs:memorials-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to create memorial.', success: '' });
    }
  }

  return (
    <>
      <h1 className="page-title">Memorials</h1>
      <p className="page-subtitle">Permanent records of restored and maintained memorials.</p>

      {(memorialState.error || customerState.error || cemeteryState.error) && (
        <div className="card warn">Backend error: {memorialState.error || customerState.error || cemeteryState.error}</div>
      )}

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Create Memorial</h3>
              <p className="meta">Add a memorial by selecting the customer, cemetery, and plot location.</p>
            </div>
          </div>
          <form className="form" onSubmit={handleCreate}>
            <label>Customer</label>
            <select
              value={form.customer_id}
              onChange={(event) => setForm((prev) => ({ ...prev, customer_id: event.target.value }))}
              required
            >
              <option value="">Select customer</option>
              {(customerState.data || []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  #{customer.id} · {customer.full_name}
                </option>
              ))}
            </select>

            <label>Cemetery</label>
            <select
              value={form.cemetery_id}
              onChange={(event) => setForm((prev) => ({ ...prev, cemetery_id: event.target.value }))}
              required
            >
              <option value="">Select cemetery</option>
              {(cemeteryState.data || []).map((cemetery) => (
                <option key={cemetery.id} value={cemetery.id}>
                  #{cemetery.id} · {cemetery.name}
                </option>
              ))}
            </select>

            <div className="field-row">
              <div>
                <label>Section</label>
                <input
                  type="text"
                  value={form.section}
                  onChange={(event) => setForm((prev) => ({ ...prev, section: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label>Row</label>
                <input
                  type="text"
                  value={form.row}
                  onChange={(event) => setForm((prev) => ({ ...prev, row: event.target.value }))}
                  required
                />
              </div>
            </div>

            <label>Plot Number</label>
            <input
              type="text"
              value={form.plot_number}
              onChange={(event) => setForm((prev) => ({ ...prev, plot_number: event.target.value }))}
              required
            />

            <label>Material</label>
            <select
              value={form.material}
              onChange={(event) => setForm((prev) => ({ ...prev, material: event.target.value }))}
            >
              <option value="granite">Granite</option>
              <option value="marble">Marble</option>
              <option value="limestone">Limestone</option>
              <option value="sandstone">Sandstone</option>
              <option value="bronze">Bronze</option>
              <option value="other">Other</option>
            </select>

            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />

            {saveState.error && <div className="form-error">{saveState.error}</div>}
            {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={saveState.loading}>
              {saveState.loading ? 'Creating...' : 'Create Memorial'}
            </button>
          </form>
        </div>

        <div className="card">
          <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Cemetery</th>
              <th>Plot</th>
              <th>Material</th>
              <th>Last Service</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {memorialState.loading && (
              <tr><td colSpan="6" className="meta">Loading...</td></tr>
            )}
            {!memorialState.loading && memorials.length === 0 && (
              <tr><td colSpan="6" className="meta">No memorials yet.</td></tr>
            )}
            {!memorialState.loading && memorials.map((row) => (
              <tr key={row.id}>
                <td>{row.customer}</td>
                <td>{row.cemetery || '—'}</td>
                <td>{[row.section, row.row, row.plot_number].filter(Boolean).join(' / ') || '—'}</td>
                <td>{row.material || '—'}</td>
                <td>{row.last_service_date || '—'}</td>
                <td><span className="tag">{row.last_service_status || 'N/A'}</span></td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SchedulingPage() {
  const servicesState = useApi('/scheduling/services/', []);
  const techState = useApi('/technicians/', []);
  const customerState = useApi('/customers/', []);
  const memorialState = useApi('/memorials/', []);
  const serviceOptionsState = useApi('/service-options/', [], true, { refreshEvent: 'hs:service-options-updated' });

  const [services, setServices] = useState([]);
  const [showCreateJobWindow, setShowCreateJobWindow] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('90');
  const [calendarDate, setCalendarDate] = useState(getStoredSchedulingDate);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const [completeState, setCompleteState] = useState({ loading: false, error: '', success: '' });
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createMemorialId, setCreateMemorialId] = useState('');
  const [createServiceOptionId, setCreateServiceOptionId] = useState('');
  const [createInfoMode, setCreateInfoMode] = useState('manual');
  const [createCemeteryName, setCreateCemeteryName] = useState('');
  const [createCemeteryAddress, setCreateCemeteryAddress] = useState('');
  const [createSection, setCreateSection] = useState('');
  const [createRow, setCreateRow] = useState('');
  const [createPlotNumber, setCreatePlotNumber] = useState('');
  const [createGpsLat, setCreateGpsLat] = useState('');
  const [createGpsLng, setCreateGpsLng] = useState('');
  const [createLocatingNotes, setCreateLocatingNotes] = useState('');
  const [createCustomerNotes, setCreateCustomerNotes] = useState('');
  const [createState, setCreateState] = useState({ loading: false, error: '', success: '' });
  const [surveyState, setSurveyState] = useState({ loading: false, error: '', data: null });
  const [surveyActionState, setSurveyActionState] = useState({ loading: false, error: '', success: '' });

  useEffect(() => {
    setServices(Array.isArray(servicesState.data) ? servicesState.data : []);
  }, [servicesState.data]);

  useEffect(() => {
    const options = Array.isArray(serviceOptionsState.data) ? serviceOptionsState.data : [];
    if (!options.length || createServiceOptionId) return;
    setCreateServiceOptionId(String(options[0].id));
  }, [serviceOptionsState.data, createServiceOptionId]);

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

    const preferred = services.find((s) => !s.technician_id || s.status === 'draft') || services[0];
    setSelectedServiceId(String(preferred.id));
    setTechnicianId(preferred.technician_id ? String(preferred.technician_id) : '');
    setScheduledStart(toDatetimeLocalInput(preferred.scheduled_start));
    setEstimatedMinutes(preferred.estimated_minutes ? String(preferred.estimated_minutes) : '90');
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

  function syncFormFromService(serviceId, options = {}) {
    const svc = services.find((item) => String(item.id) === String(serviceId));
    if (!svc) return;
    setSelectedServiceId(String(svc.id));
    setTechnicianId(svc.technician_id ? String(svc.technician_id) : '');
    setScheduledStart(toDatetimeLocalInput(svc.scheduled_start));
    setEstimatedMinutes(svc.estimated_minutes ? String(svc.estimated_minutes) : '90');
    if (options.resetState !== false) {
      setSubmitState({ loading: false, error: '', success: '' });
      setCompleteState({ loading: false, error: '', success: '' });
    }
  }

  function resetCreateForm() {
    setCreateCustomerId('');
    setCreateMemorialId('');
    setCreateServiceOptionId('');
    setCreateInfoMode('manual');
    setCreateCemeteryName('');
    setCreateCemeteryAddress('');
    setCreateSection('');
    setCreateRow('');
    setCreatePlotNumber('');
    setCreateGpsLat('');
    setCreateGpsLng('');
    setCreateLocatingNotes('');
    setCreateCustomerNotes('');
    setCreateState({ loading: false, error: '', success: '' });
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

    const payload = {
      technician_id: Number(technicianId),
      scheduled_start: datetimeLocalToIso(scheduledStart),
      estimated_minutes: Number(estimatedMinutes) || 90
    };

    try {
      const res = await apiFetch(`/manager/services/${selectedServiceId}/assign/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let payload;
        try {
          payload = await res.json();
        } catch (error) {
          payload = await res.text();
        }
        throw new Error(formatApiError(payload, `Assign failed (${res.status})`));
      }
      const json = await res.json();
      if (json.service) {
        setServices((prev) => prev.map((item) => (item.id === json.service.id ? json.service : item)));
        setCalendarDate(toDateInputValue(json.service.scheduled_start || new Date()));
      }
      window.dispatchEvent(new Event('hs:schedule-updated'));
      setSubmitState({ loading: false, error: '', success: 'Technician assigned.' });
    } catch (err) {
      setSubmitState({ loading: false, error: err.message || 'Failed to save schedule.', success: '' });
    }
  }

  async function handleCreateJob(event) {
    event.preventDefault();
    setCreateState({ loading: true, error: '', success: '' });
    if (!createCustomerId) {
      setCreateState({ loading: false, error: 'Select a customer.', success: '' });
      return;
    }
    if (!createServiceOptionId) {
      setCreateState({ loading: false, error: 'Select a service.', success: '' });
      return;
    }
    const shouldSendSurvey = createInfoMode === 'survey';
    try {
      const latValue = createGpsLat.trim();
      const lngValue = createGpsLng.trim();
      if (createInfoMode === 'manual' && ((latValue && !lngValue) || (!latValue && lngValue))) {
        setCreateState({ loading: false, error: 'Enter both GPS fields or leave both blank.', success: '' });
        return;
      }
      let gpsLat = null;
      let gpsLng = null;
      if (createInfoMode === 'manual' && latValue && lngValue) {
        const parsedLat = parseCoordinate(latValue, 'lat');
        const parsedLng = parseCoordinate(lngValue, 'lng');
        if (!parsedLat.ok || !parsedLng.ok) {
          setCreateState({
            loading: false,
            error: parsedLat.error || parsedLng.error || 'Invalid GPS coordinates.',
            success: ''
          });
          return;
        }
        gpsLat = parsedLat.value;
        gpsLng = parsedLng.value;
      }
      const res = await apiFetch('/scheduling/services/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: Number(createCustomerId),
          memorial_id: createMemorialId ? Number(createMemorialId) : undefined,
          service_option_id: Number(createServiceOptionId),
          send_survey_email: shouldSendSurvey,
          cemetery_name: shouldSendSurvey ? '' : createCemeteryName,
          cemetery_address: shouldSendSurvey ? '' : createCemeteryAddress,
          section: shouldSendSurvey ? '' : createSection,
          row: shouldSendSurvey ? '' : createRow,
          plot_number: shouldSendSurvey ? '' : createPlotNumber,
          gps_lat: shouldSendSurvey ? null : gpsLat,
          gps_lng: shouldSendSurvey ? null : gpsLng,
          locating_notes: shouldSendSurvey ? '' : createLocatingNotes,
          customer_notes: shouldSendSurvey ? '' : createCustomerNotes
        })
      });
      if (!res.ok) {
        let payload;
        try {
          payload = await res.json();
        } catch (error) {
          payload = await res.text();
        }
        throw new Error(formatApiError(payload, `Create failed (${res.status})`));
      }
      const json = await res.json();
      if (json.service) {
        setServices((prev) => [json.service, ...prev]);
        syncFormFromService(json.service.id);
      }
      if (json.survey) {
        setSurveyState({ loading: false, error: '', data: json.survey });
      }
      setSurveyActionState({ loading: false, error: '', success: '' });
      resetCreateForm();
      setShowCreateJobWindow(false);
      setCreateState({
        loading: false,
        error: '',
        success: json.detail || 'Job created and survey sent to the customer.'
      });
    } catch (err) {
      setCreateState({ loading: false, error: err.message || 'Failed to create job.', success: '' });
    }
  }

  async function handleMarkComplete() {
    if (!selectedServiceId) {
      setCompleteState({ loading: false, error: 'Select a job first.', success: '' });
      return;
    }

    setCompleteState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch(`/manager/services/${selectedServiceId}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        let payload;
        try {
          payload = await res.json();
        } catch (error) {
          payload = await res.text();
        }
        throw new Error(formatApiError(payload, `Complete failed (${res.status})`));
      }
      const json = await res.json();
      setServices((prev) => prev.filter((item) => item.id !== Number(selectedServiceId)));
      setSelectedServiceId('');
      setTechnicianId('');
      setScheduledStart('');
      setEstimatedMinutes('90');
      window.dispatchEvent(new Event('hs:schedule-updated'));
      setCompleteState({
        loading: false,
        error: '',
        success: `${getServiceTypeLabel(json.service)} marked complete.`
      });
    } catch (err) {
      setCompleteState({ loading: false, error: err.message || 'Failed to complete job.', success: '' });
    }
  }

  const scheduledForDay = useMemo(() => {
    return services
      .filter((svc) => svc.scheduled_start && toDateInputValue(svc.scheduled_start) === calendarDate)
      .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
  }, [services, calendarDate]);

  const unassignedServices = useMemo(
    () => services.filter((svc) => !svc.technician_id || svc.status === 'draft'),
    [services]
  );

  const memorialOptions = useMemo(
    () => (Array.isArray(memorialState.data) ? memorialState.data : []),
    [memorialState.data]
  );

  const customerOptions = useMemo(
    () => (Array.isArray(customerState.data) ? customerState.data : []),
    [customerState.data]
  );
  const [createCustomerSearch, setCreateCustomerSearch] = useState('');
  const normalizedCreateCustomerSearch = createCustomerSearch.trim().toLowerCase();

  const filteredCustomerOptions = useMemo(() => {
    if (!normalizedCreateCustomerSearch) return customerOptions;
    return customerOptions.filter((customer) => {
      const searchIndex = [
        customer.full_name,
        customer.email,
        customer.phone,
        customer.city,
        customer.state,
        customer.postal_code
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchIndex.includes(normalizedCreateCustomerSearch);
    });
  }, [customerOptions, normalizedCreateCustomerSearch]);

  const memorialsForCreateCustomer = useMemo(
    () => memorialOptions.filter((memorial) => String(memorial.customer_id) === String(createCustomerId)),
    [memorialOptions, createCustomerId]
  );

  useEffect(() => {
    if (!createCustomerId) {
      if (createMemorialId) setCreateMemorialId('');
      return;
    }
    if (memorialsForCreateCustomer.length === 1) {
      const onlyMemorialId = String(memorialsForCreateCustomer[0].id);
      if (createMemorialId !== onlyMemorialId) setCreateMemorialId(onlyMemorialId);
      return;
    }
    if (!memorialsForCreateCustomer.some((memorial) => String(memorial.id) === String(createMemorialId))) {
      setCreateMemorialId('');
    }
  }, [createCustomerId, createMemorialId, memorialsForCreateCustomer]);

  const schedulableServices = useMemo(
    () => services.filter((svc) => svc.status !== 'completed'),
    [services]
  );

  const assignedServices = useMemo(
    () => services.filter((svc) => Boolean(svc.technician_id) && svc.status !== 'draft'),
    [services]
  );

  useEffect(() => {
    if (!selectedServiceId || !schedulableServices.length) return;
    const stillSchedulable = schedulableServices.some((svc) => String(svc.id) === String(selectedServiceId));
    if (!stillSchedulable) {
      syncFormFromService(schedulableServices[0].id, { resetState: false });
    }
  }, [selectedServiceId, schedulableServices]);

  useEffect(() => {
    let cancelled = false;

    async function loadSurveyDetail() {
      if (!selectedServiceId) {
        setSurveyState({ loading: false, error: '', data: null });
        return;
      }

      setSurveyState((prev) => ({ loading: true, error: '', data: prev.data }));
      try {
        const res = await apiFetch(`/manage/services/${selectedServiceId}/survey/`);
        const json = await res.json();
        if (!res.ok) throw new Error(formatApiError(json, `Survey lookup failed (${res.status})`));
        if (!cancelled) setSurveyState({ loading: false, error: '', data: json });
      } catch (err) {
        if (!cancelled) setSurveyState({ loading: false, error: err.message || 'Failed to load survey status.', data: null });
      }
    }

    loadSurveyDetail();
    return () => { cancelled = true; };
  }, [selectedServiceId]);

  async function handleGenerateSurveyLink() {
    if (!selectedServiceId) {
      setSurveyActionState({ loading: false, error: 'Select a job first.', success: '' });
      return;
    }

    setSurveyActionState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch(`/manage/services/${selectedServiceId}/survey/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Survey link failed (${res.status})`));
      setSurveyState({ loading: false, error: '', data: json });
      if (json.service) {
        setServices((prev) => prev.map((item) => (item.id === json.service.id ? json.service : item)));
      }
      setSurveyActionState({
        loading: false,
        error: '',
        success: json.detail || (json.request?.status === 'submitted' ? 'Survey was already submitted.' : 'Survey sent.')
      });
    } catch (err) {
      setSurveyActionState({ loading: false, error: err.message || 'Failed to generate survey link.', success: '' });
    }
  }

  async function handleCopySurveyLink() {
    const publicUrl = surveyState.data?.public_url || '';
    try {
      await copyTextToClipboard(publicUrl);
      setSurveyActionState({ loading: false, error: '', success: 'Survey link copied.' });
    } catch (err) {
      setSurveyActionState({ loading: false, error: err.message || 'Failed to copy survey link.', success: '' });
    }
  }

  const surveyDetail = surveyState.data;
  const surveyRequest = surveyDetail?.request || null;
  const surveySubmission = surveyDetail?.submission || null;
  const surveyStatus = selectedService?.survey_status || surveyRequest?.status || 'not_sent';

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Scheduling</h1>
          <p className="page-subtitle">Create jobs first, then assign technicians when the schedule is ready.</p>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            setShowCreateJobWindow(true);
            setCreateState({ loading: false, error: '', success: '' });
          }}
        >
          New Job
        </button>
      </div>

      {(servicesState.error || techState.error || customerState.error || memorialState.error || serviceOptionsState.error) && (
        <div className="card warn">
          Backend error: {servicesState.error || techState.error || customerState.error || memorialState.error || serviceOptionsState.error}
        </div>
      )}

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Jobs Loaded</span>
          <strong>{services.length}</strong>
          <small>{servicesState.loading ? 'Loading...' : 'From scheduling API'}</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Unassigned</span>
          <strong>{unassignedServices.length}</strong>
          <small>Waiting for technician assignment</small>
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
          <SchedulingCalendar
            services={services}
            calendarDate={calendarDate}
            onDateChange={setCalendarDate}
            onSelectService={syncFormFromService}
            selectedServiceId={selectedServiceId}
          />
          {scheduledForDay.length === 0 && <p className="meta">No jobs scheduled for this date.</p>}
          {scheduledForDay.length > 0 && (
            <ul className="service-list scheduling-agenda">
              {scheduledForDay.map((svc) => (
                <li
                  key={svc.id}
                  className={String(selectedServiceId) === String(svc.id) ? 'selected' : ''}
                  onClick={() => syncFormFromService(svc.id)}
                >
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">
                    {getServiceTypeLabel(svc)} · {formatDateTimeShort(svc.scheduled_start)} · {svc.technician_name || 'Unassigned'} · {svc.estimated_minutes || 0} min
                    {svc.price != null ? ` · ${formatCurrency(Number(svc.price))}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Unassigned Jobs</h3>
              <p className="meta">Create now, assign later. Draft jobs stay here until a technician is scheduled.</p>
            </div>
          </div>
          {unassignedServices.length === 0 && <p className="meta">No unassigned jobs right now.</p>}
          {unassignedServices.length > 0 && (
            <ul className="service-list scheduling-agenda">
              {unassignedServices.map((svc) => (
                <li
                  key={svc.id}
                  className={String(selectedServiceId) === String(svc.id) ? 'selected' : ''}
                  onClick={() => syncFormFromService(svc.id)}
                >
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">
                    {getServiceTypeLabel(svc)} · #{svc.id} · {svc.price != null ? formatCurrency(Number(svc.price)) : 'No price yet'} · {svc.gps_lat != null && svc.gps_lng != null ? `${svc.gps_lat}, ${svc.gps_lng}` : 'GPS pending'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Assign Technician</h3>
              <p className="meta">Use this to assign or reassign a technician, update the start time, or change the duration.</p>
            </div>
          </div>
          {selectedService && (
            <div className="job-detail-summary">
              <strong>{selectedService.memorial_name || `Service #${selectedService.id}`}</strong>
              <span>{selectedService.cemetery_name || 'No cemetery listed'}</span>
              <div className="meta">
                {getServiceTypeLabel(selectedService)} · Status: {selectedService.status || 'draft'} · Price: {selectedService.price != null ? formatCurrency(Number(selectedService.price)) : '—'} · GPS: {selectedService.gps_lat != null && selectedService.gps_lng != null ? `${selectedService.gps_lat}, ${selectedService.gps_lng}` : '—'}
              </div>
            </div>
          )}
          <form className="form" onSubmit={handleAssign}>
            <label>Job</label>
            <select
              value={selectedServiceId}
              onChange={(event) => syncFormFromService(event.target.value)}
              required
            >
              <option value="">Select a job</option>
              {schedulableServices.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  #{svc.id} · {getServiceTypeLabel(svc)} · {svc.memorial_name || 'Memorial'} · {svc.technician_name || 'Unassigned'}
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

            {submitState.error && <div className="form-error">{submitState.error}</div>}
            {submitState.success && <div className="card form-success"><strong>{submitState.success}</strong></div>}
            {completeState.error && <div className="form-error">{completeState.error}</div>}
            {completeState.success && <div className="card form-success"><strong>{completeState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={submitState.loading}>
              {submitState.loading ? 'Saving...' : selectedService?.technician_id ? 'Save Assignment' : 'Assign Technician'}
            </button>
            {selectedService && selectedService.status !== 'completed' && (
              <button
                className="ghost-btn"
                type="button"
                onClick={handleMarkComplete}
                disabled={completeState.loading}
              >
                {completeState.loading ? 'Completing...' : 'Mark Complete'}
              </button>
            )}
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Assigned Jobs</h3>
              <p className="meta">Scheduled jobs with technicians already attached.</p>
            </div>
          </div>
          {assignedServices.length === 0 && <p className="meta">No assigned jobs yet.</p>}
          {assignedServices.length > 0 && (
            <ul className="service-list scheduling-agenda">
              {assignedServices
                .sort((a, b) => {
                  const aTime = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
                  const bTime = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
                  return aTime - bTime;
                })
                .map((svc) => (
                  <li
                    key={svc.id}
                    className={String(selectedServiceId) === String(svc.id) ? 'selected' : ''}
                    onClick={() => syncFormFromService(svc.id)}
                  >
                    <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                    <span>{svc.technician_name || 'No technician'}</span>
                    <div className="meta">
                      {getServiceTypeLabel(svc)} · {formatDateTimeShort(svc.scheduled_start)} · {svc.estimated_minutes || 0} min
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
              <div className="card-header">
            <div>
              <h3>Customer Survey</h3>
              <p className="meta">Send or resend the customer survey from here when you want to collect details by email.</p>
            </div>
          </div>
          {!selectedService && <p className="meta">Select a job to review or resend its customer survey.</p>}
          {selectedService && (
            <>
              <div className="survey-status-grid">
                <div className="survey-status-item">
                  <strong>Status</strong>
                  <span className="tag">{surveyStatus}</span>
                </div>
                <div className="survey-status-item">
                  <strong>Sent</strong>
                  <span>{surveyRequest?.sent_at ? formatDateTimeShort(surveyRequest.sent_at) : 'Not sent'}</span>
                </div>
                <div className="survey-status-item">
                  <strong>Expires</strong>
                  <span>{surveyRequest?.expires_at ? formatDateTimeShort(surveyRequest.expires_at) : '—'}</span>
                </div>
                <div className="survey-status-item">
                  <strong>Submitted</strong>
                  <span>{surveyRequest?.submitted_at ? formatDateTimeShort(surveyRequest.submitted_at) : '—'}</span>
                </div>
              </div>

              {surveyState.loading && <p className="meta">Loading survey details...</p>}
              {surveyState.error && <div className="form-error">{surveyState.error}</div>}

              {!surveyState.loading && (
                <>
                  <div className="survey-link-box">
                    <label>Public Survey Link</label>
                    <input type="text" value={surveyDetail?.public_url || ''} readOnly placeholder="Survey link will appear here after you send it" />
                  </div>

                  {surveyActionState.error && <div className="form-error">{surveyActionState.error}</div>}
                  {surveyActionState.success && <div className="card form-success"><strong>{surveyActionState.success}</strong></div>}

                  <div className="modal-actions">
                    <button className="primary-btn" type="button" onClick={handleGenerateSurveyLink} disabled={surveyActionState.loading}>
                      {surveyActionState.loading ? 'Working...' : surveyRequest ? 'Resend Survey Link' : 'Send Survey Link'}
                    </button>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={handleCopySurveyLink}
                      disabled={!surveyDetail?.public_url}
                    >
                      Copy Link
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="card">
              <div className="card-header">
            <div>
              <h3>Survey Review</h3>
              <p className="meta">Customer-submitted data is applied to the system automatically after submission and is shown here for reference.</p>
            </div>
          </div>
          {!selectedService && <p className="meta">Select a job to review any submitted survey data.</p>}
          {selectedService && !surveySubmission && <p className="meta">No survey submission has been received for this job yet.</p>}
          {selectedService && surveySubmission && (
            <div className="survey-review-grid">
              <div><strong>Name</strong><span>{surveySubmission.customer_name || '—'}</span></div>
              <div><strong>Email</strong><span>{surveySubmission.email || '—'}</span></div>
              <div><strong>Phone</strong><span>{surveySubmission.phone || '—'}</span></div>
              <div><strong>Cemetery</strong><span>{surveySubmission.cemetery_name || '—'}</span></div>
              <div><strong>Address</strong><span>{surveySubmission.cemetery_address || '—'}</span></div>
              <div><strong>Plot</strong><span>{[surveySubmission.section, surveySubmission.row, surveySubmission.plot_number, surveySubmission.grave_number].filter(Boolean).join(' / ') || '—'}</span></div>
              <div><strong>GPS</strong><span>{surveySubmission.gps_lat != null && surveySubmission.gps_lng != null ? `${surveySubmission.gps_lat}, ${surveySubmission.gps_lng}` : '—'}</span></div>
              <div><strong>Submitted</strong><span>{formatDateTimeShort(surveySubmission.created_at)}</span></div>
              <div className="survey-review-block"><strong>Locating Notes</strong><span>{surveySubmission.locating_notes || '—'}</span></div>
              <div className="survey-review-block"><strong>Extra Notes</strong><span>{surveySubmission.extra_notes || '—'}</span></div>
              {surveySubmission.photo_url && (
                <div className="survey-review-block">
                  <strong>Photo</strong>
                  <a href={surveySubmission.photo_url} target="_blank" rel="noreferrer">Open uploaded photo</a>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="card">
        <h3>All Jobs</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Memorial</th>
                <th>Cemetery</th>
                <th>Status</th>
                <th>When</th>
                <th>Technician</th>
                <th>Price</th>
                <th>GPS</th>
                <th>Survey</th>
              </tr>
            </thead>
            <tbody>
              {servicesState.loading && (
                <tr><td colSpan="10" className="meta">Loading jobs...</td></tr>
              )}
              {!servicesState.loading && services.length === 0 && (
                <tr><td colSpan="10" className="meta">No jobs found yet.</td></tr>
              )}
              {!servicesState.loading && services.map((svc) => (
                <tr
                  key={svc.id}
                  className="clickable-row"
                  onClick={() => syncFormFromService(svc.id)}
                >
                  <td>#{svc.id}</td>
                  <td>{getServiceTypeLabel(svc)}</td>
                  <td>{svc.memorial_name || '—'}</td>
                  <td>{svc.cemetery_name || '—'}</td>
                  <td><span className="tag">{svc.status || '—'}</span></td>
                  <td>{formatDateTimeShort(svc.scheduled_start)}</td>
                  <td>{svc.technician_name || 'Unassigned'}</td>
                  <td>{svc.price != null ? formatCurrency(Number(svc.price)) : '—'}</td>
                  <td>
                    {svc.gps_lat != null && svc.gps_lng != null
                      ? `${svc.gps_lat}, ${svc.gps_lng}`
                      : '—'}
                  </td>
                  <td><span className="tag">{svc.survey_status || 'not_sent'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createState.success && <div className="card form-success"><strong>{createState.success}</strong></div>}

      {showCreateJobWindow && (
        <div className="panel-overlay" onClick={() => {
          resetCreateForm();
          setShowCreateJobWindow(false);
        }}>
          <div className="panel-window" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <h3>Create Job</h3>
                <p className="meta">Start from the customer, then choose whether to enter the location details now or send the customer a survey email.</p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  resetCreateForm();
                  setShowCreateJobWindow(false);
                }}
              >
                Close
              </button>
            </div>

            <form className="form" onSubmit={handleCreateJob}>
              <label>Customer</label>
              <div className="entity-search entity-search-stacked">
                <input
                  type="search"
                  value={createCustomerSearch}
                  onChange={(event) => setCreateCustomerSearch(event.target.value)}
                  placeholder="Search customer by name, email, phone..."
                  aria-label="Search customers for new job"
                />
                {createCustomerSearch && (
                  <button className="ghost-btn" type="button" onClick={() => setCreateCustomerSearch('')}>
                    Clear
                  </button>
                )}
              </div>
              <select
                value={createCustomerId}
                onChange={(event) => setCreateCustomerId(event.target.value)}
                required
              >
                <option value="">Select customer</option>
                {filteredCustomerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    #{customer.id} · {customer.full_name} · {customer.memorials_count || 0} memorial(s)
                  </option>
                ))}
              </select>
              {!customerState.loading && customerOptions.length > 0 && filteredCustomerOptions.length === 0 && (
                <p className="meta">No customers match that search.</p>
              )}

              {createCustomerId && memorialsForCreateCustomer.length > 1 && (
                <>
                  <label>Memorial</label>
                  <select
                    value={createMemorialId}
                    onChange={(event) => setCreateMemorialId(event.target.value)}
                    required
                  >
                    <option value="">Select memorial</option>
                    {memorialsForCreateCustomer.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.cemetery || 'Cemetery'}
                      </option>
                    ))}
                  </select>
                  <p className="meta">This customer has multiple memorials, so pick which one this job belongs to.</p>
                </>
              )}

              {createCustomerId && memorialsForCreateCustomer.length === 1 && (
                <p className="meta">
                  Memorial selected automatically: #{memorialsForCreateCustomer[0].id} · {memorialsForCreateCustomer[0].cemetery || 'Cemetery'}
                </p>
              )}

              {createCustomerId && memorialsForCreateCustomer.length === 0 && (
                <p className="meta">No memorial is on file yet. A temporary memorial record will be created and completed from the survey response.</p>
              )}

              <label>Service</label>
              <select
                value={createServiceOptionId}
                onChange={(event) => setCreateServiceOptionId(event.target.value)}
                required
              >
                <option value="">Select service</option>
                {(serviceOptionsState.data || []).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
              {!serviceOptionsState.loading && (!serviceOptionsState.data || serviceOptionsState.data.length === 0) && (
                <p className="meta">No services are configured yet. Add them in Admin Settings.</p>
              )}

              <label>How do you want to collect details?</label>
              <select
                value={createInfoMode}
                onChange={(event) => setCreateInfoMode(event.target.value)}
              >
                <option value="manual">Enter details manually</option>
                <option value="survey">Send survey email</option>
              </select>

              {createInfoMode === 'manual' && (
                <>
                  <div className="field-row">
                    <div>
                      <label>Cemetery</label>
                      <input
                        value={createCemeteryName}
                        onChange={(event) => setCreateCemeteryName(event.target.value)}
                        placeholder="Oak Hill Cemetery"
                      />
                    </div>
                    <div>
                      <label>Cemetery Address</label>
                      <input
                        value={createCemeteryAddress}
                        onChange={(event) => setCreateCemeteryAddress(event.target.value)}
                        placeholder="123 Cemetery Rd"
                      />
                    </div>
                  </div>

                  <div className="field-row">
                    <div>
                      <label>Section</label>
                      <input value={createSection} onChange={(event) => setCreateSection(event.target.value)} placeholder="A" />
                    </div>
                    <div>
                      <label>Row</label>
                      <input value={createRow} onChange={(event) => setCreateRow(event.target.value)} placeholder="2" />
                    </div>
                    <div>
                      <label>Plot</label>
                      <input value={createPlotNumber} onChange={(event) => setCreatePlotNumber(event.target.value)} placeholder="14" />
                    </div>
                  </div>

                  <div className="field-row">
                    <div>
                      <label>GPS Latitude</label>
                      <input
                        type="text"
                        placeholder="e.g. 40.730610"
                        value={createGpsLat}
                        onChange={(event) => setCreateGpsLat(event.target.value)}
                      />
                    </div>
                    <div>
                      <label>GPS Longitude</label>
                      <input
                        type="text"
                        placeholder="e.g. -73.935242"
                        value={createGpsLng}
                        onChange={(event) => setCreateGpsLng(event.target.value)}
                      />
                    </div>
                  </div>

                  <label>Location Notes</label>
                  <textarea
                    rows="3"
                    value={createLocatingNotes}
                    onChange={(event) => setCreateLocatingNotes(event.target.value)}
                    placeholder="Near the oak tree, west side entrance, etc."
                  />

                  <label>Customer Notes</label>
                  <textarea
                    rows="3"
                    value={createCustomerNotes}
                    onChange={(event) => setCreateCustomerNotes(event.target.value)}
                    placeholder="Anything the customer already told you about this job."
                  />

                  <p className="meta">Use manual entry when you already know the memorial location and customer notes.</p>
                </>
              )}

              {createInfoMode === 'survey' && (
                <p className="meta">The job will be created first, and the survey email will only be sent because you selected this option.</p>
              )}

              {createState.error && <div className="form-error">{createState.error}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateJobWindow(false);
                  }}
                >
                  Cancel
                </button>
                <button className="primary-btn" type="submit" disabled={createState.loading || memorialState.loading}>
                  {createState.loading ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function UsersAdminPage() {
  const employeesState = useApi('/manage/employees/', []);
  const [employees, setEmployees] = useState([]);
  const [usernameDrafts, setUsernameDrafts] = useState({});
  const [nameDrafts, setNameDrafts] = useState({});
  const [emailDrafts, setEmailDrafts] = useState({});
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [roleDrafts, setRoleDrafts] = useState({});
  const [activeDrafts, setActiveDrafts] = useState({});
  const [createForm, setCreateForm] = useState({
    username: '',
    full_name: '',
    email: '',
    phone: '',
    role: 'tech'
  });
  const [createState, setCreateState] = useState({ loading: false, error: '', success: '' });
  const [updateState, setUpdateState] = useState({ loadingId: null, error: '', success: '' });

  useEffect(() => {
    const rows = Array.isArray(employeesState.data) ? employeesState.data : [];
    setEmployees(rows);
    const nextUsernames = {};
    const nextNames = {};
    const nextEmails = {};
    const nextPhones = {};
    const nextRoles = {};
    const nextActive = {};
    rows.forEach((row) => {
      nextUsernames[row.id] = row.username || '';
      nextNames[row.id] = row.full_name || '';
      nextEmails[row.id] = row.email || '';
      nextPhones[row.id] = row.phone || '';
      nextRoles[row.id] = row.role;
      nextActive[row.id] = Boolean(row.is_active);
    });
    setUsernameDrafts(nextUsernames);
    setNameDrafts(nextNames);
    setEmailDrafts(nextEmails);
    setPhoneDrafts(nextPhones);
    setRoleDrafts(nextRoles);
    setActiveDrafts(nextActive);
  }, [employeesState.data]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreateState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch('/manage/employees/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      setEmployees((prev) => [...prev, json.employee].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setCreateForm({ username: '', full_name: '', email: '', phone: '', role: 'tech' });
      setCreateState({
        loading: false,
        error: '',
        success: `Invite sent to ${json.employee.email || json.invite?.invited_email || 'employee email'}.`
      });
    } catch (err) {
      setCreateState({ loading: false, error: err.message || 'Failed to create user.', success: '' });
    }
  }

  async function handleSaveRole(employeeId) {
    setUpdateState({ loadingId: employeeId, error: '', success: '' });
    try {
      const payload = {
        username: usernameDrafts[employeeId],
        full_name: nameDrafts[employeeId],
        email: emailDrafts[employeeId],
        phone: phoneDrafts[employeeId],
        role: roleDrafts[employeeId],
        is_active: Boolean(activeDrafts[employeeId])
      };
      const res = await apiFetch(`/manage/employees/${employeeId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      setEmployees((prev) => prev.map((e) => (e.id === employeeId ? json.employee : e)));
      setUsernameDrafts((prev) => ({ ...prev, [employeeId]: json.employee.username || '' }));
      setNameDrafts((prev) => ({ ...prev, [employeeId]: json.employee.full_name || '' }));
      setEmailDrafts((prev) => ({ ...prev, [employeeId]: json.employee.email || '' }));
      setPhoneDrafts((prev) => ({ ...prev, [employeeId]: json.employee.phone || '' }));
      setUpdateState({ loadingId: null, error: '', success: 'User updated.' });
    } catch (err) {
      setUpdateState({ loadingId: null, error: err.message || 'Failed to update user.', success: '' });
    }
  }

  return (
    <>
      <h1 className="page-title">Users & Roles</h1>
      <p className="page-subtitle">Manage staff accounts and role assignments.</p>

      {employeesState.error && <div className="card warn">Backend error: {employeesState.error}</div>}

      <section className="grid-2">
        <div className="card">
          <h3>Invite Staff User</h3>
          <form className="form" onSubmit={handleCreate}>
            <label>Username</label>
            <input value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))} required />
            <label>Full Name</label>
            <input value={createForm.full_name} onChange={(e) => setCreateForm((p) => ({ ...p, full_name: e.target.value }))} required />
            <label>Email</label>
            <input type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} required />
            <label>Phone</label>
            <input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
            <label>Role</label>
            <select value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="front_desk">Front Desk</option>
              <option value="manager">Manager</option>
              <option value="tech">Technician</option>
              <option value="other">Other</option>
            </select>
            {createState.error && <div className="form-error">{createState.error}</div>}
            {createState.success && <div className="card form-success"><strong>{createState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={createState.loading}>
              {createState.loading ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </form>
        </div>

        <div className="card users-admin-card">
          <h3>Existing Staff</h3>
          {updateState.error && <div className="form-error">{updateState.error}</div>}
          {updateState.success && <p className="meta">{updateState.success}</p>}
          {employeesState.loading && <p className="meta">Loading staff...</p>}
          {!employeesState.loading && employees.length === 0 && <p className="meta">No staff users yet.</p>}
          {!employeesState.loading && employees.length > 0 && (
            <div className="staff-editor-list">
              {employees.map((row) => (
                <section key={row.id} className="staff-editor-row">
                  <div className="staff-editor-header">
                    <div className="staff-editor-identity">
                      <strong>{nameDrafts[row.id] || row.full_name || 'Staff user'}</strong>
                      <div className="staff-editor-meta">
                        <span>@{usernameDrafts[row.id] || row.username || 'username'}</span>
                        <span className={`staff-status-pill${Boolean(activeDrafts[row.id]) ? ' is-active' : ''}`}>
                          {Boolean(activeDrafts[row.id]) ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <button
                      className="ghost-btn"
                      onClick={() => handleSaveRole(row.id)}
                      disabled={updateState.loadingId === row.id}
                    >
                      {updateState.loadingId === row.id ? 'Saving...' : 'Update'}
                    </button>
                  </div>

                  <div className="staff-editor-grid">
                    <label className="staff-field">
                      <span className="staff-field-label">Full Name</span>
                      <input
                        value={nameDrafts[row.id] || ''}
                        onChange={(e) => setNameDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                      />
                    </label>

                    <label className="staff-field">
                      <span className="staff-field-label">Username</span>
                      <input
                        value={usernameDrafts[row.id] || ''}
                        onChange={(e) => setUsernameDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                      />
                    </label>

                    <label className="staff-field">
                      <span className="staff-field-label">Email</span>
                      <input
                        type="email"
                        value={emailDrafts[row.id] || ''}
                        onChange={(e) => setEmailDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                      />
                    </label>

                    <label className="staff-field">
                      <span className="staff-field-label">Phone</span>
                      <input
                        value={phoneDrafts[row.id] || ''}
                        onChange={(e) => setPhoneDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                      />
                    </label>

                    <label className="staff-field">
                      <span className="staff-field-label">Role</span>
                      <select value={roleDrafts[row.id] || row.role} onChange={(e) => setRoleDrafts((p) => ({ ...p, [row.id]: e.target.value }))}>
                        <option value="admin">Admin</option>
                        <option value="front_desk">Front Desk</option>
                        <option value="manager">Manager</option>
                        <option value="tech">Technician</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <label className="staff-field staff-active-toggle">
                      <span className="staff-field-label">Account</span>
                      <div className="staff-active-toggle-row">
                        <em className={Boolean(activeDrafts[row.id]) ? 'is-active' : ''}>
                          {Boolean(activeDrafts[row.id]) ? 'Enabled' : 'Disabled'}
                        </em>
                        <span className="checkbox-switch checkbox-switch-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(activeDrafts[row.id])}
                            onChange={(e) => setActiveDrafts((p) => ({ ...p, [row.id]: e.target.checked }))}
                          />
                          <span className="checkbox-switch-track" aria-hidden="true"></span>
                        </span>
                      </div>
                    </label>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function CustomersPage() {
  const customerState = useApi('/manage/customers/', []);
  const [customers, setCustomers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [saveState, setSaveState] = useState({ loading: false, error: '', success: '' });

  useEffect(() => {
    setCustomers(Array.isArray(customerState.data) ? customerState.data : []);
  }, [customerState.data]);

  function startCreate() {
    setEditingId(null);
    setForm({ full_name: '', email: '', phone: '' });
    setSaveState({ loading: false, error: '', success: '' });
  }

  function startEdit(customer) {
    setEditingId(customer.id);
    setForm({ full_name: customer.full_name || '', email: customer.email || '', phone: customer.phone || '' });
    setSaveState({ loading: false, error: '', success: '' });
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const isEdit = Boolean(editingId);
      const res = await apiFetch(
        isEdit ? `/manage/customers/${editingId}/` : '/manage/customers/',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      const payload = json.customer;
      setCustomers((prev) => {
        if (isEdit) return prev.map((c) => (c.id === payload.id ? { ...c, ...payload } : c));
        return [...prev, payload].sort((a, b) => a.full_name.localeCompare(b.full_name));
      });
      setSaveState({ loading: false, error: '', success: isEdit ? 'Customer updated.' : 'Customer created.' });
      if (!isEdit) startCreate();
      window.dispatchEvent(new Event('hs:customers-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to save customer.', success: '' });
    }
  }

  async function handleDelete(customerId) {
    const confirmDelete = window.confirm('Delete this customer?');
    if (!confirmDelete) return;
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch(`/manage/customers/${customerId}/`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
      if (editingId === customerId) startCreate();
      setSaveState({ loading: false, error: '', success: 'Customer deleted.' });
      window.dispatchEvent(new Event('hs:customers-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to delete customer.', success: '' });
    }
  }

  return (
    <>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Create, edit, and manage customer records.</p>

      {customerState.error && <div className="card warn">Backend error: {customerState.error}</div>}

      <section className="grid-2">
        <div className="card">
          <h3>{editingId ? `Edit Customer #${editingId}` : 'New Customer'}</h3>
          <form className="form" onSubmit={handleSave}>
            <label>Full Name</label>
            <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            {saveState.error && <div className="form-error">{saveState.error}</div>}
            {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="primary-btn" type="submit" disabled={saveState.loading}>
                {saveState.loading ? 'Saving...' : (editingId ? 'Update Customer' : 'Create Customer')}
              </button>
              <button className="ghost-btn" type="button" onClick={startCreate}>Clear</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Customer List</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Memorials</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerState.loading && <tr><td colSpan="5" className="meta">Loading...</td></tr>}
                {!customerState.loading && customers.length === 0 && <tr><td colSpan="5" className="meta">No customers yet.</td></tr>}
                {!customerState.loading && customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.full_name}</td>
                    <td>{c.memorials_count || 0}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button className="ghost-btn" onClick={() => startEdit(c)}>Edit</button>
                      <button className="ghost-btn" onClick={() => handleDelete(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function CemeteriesPage() {
  const cemeteryState = useApi('/manage/cemeteries/', [], true, { refreshEvent: 'hs:cemeteries-updated' });
  const [cemeteries, setCemeteries] = useState([]);
  const [showCreateCemeteryWindow, setShowCreateCemeteryWindow] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    notes: ''
  });
  const [saveState, setSaveState] = useState({ loading: false, error: '', success: '' });

  useEffect(() => {
    setCemeteries(Array.isArray(cemeteryState.data) ? cemeteryState.data : []);
  }, [cemeteryState.data]);

  function resetCreateForm() {
    setForm({
      name: '',
      address: '',
      city: '',
      state: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      notes: ''
    });
    setSaveState({ loading: false, error: '', success: '' });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch('/manage/cemeteries/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Create failed (${res.status})`));
      setCemeteries((prev) => [...prev, json.cemetery].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
      resetCreateForm();
      setShowCreateCemeteryWindow(false);
      setSaveState({ loading: false, error: '', success: 'Cemetery created.' });
      window.dispatchEvent(new Event('hs:cemeteries-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to create cemetery.', success: '' });
    }
  }

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Cemeteries</h1>
          <p className="page-subtitle">Service locations and memorial distribution.</p>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            setShowCreateCemeteryWindow(true);
            setSaveState({ loading: false, error: '', success: '' });
          }}
        >
          New Cemetery
        </button>
      </div>

      {cemeteryState.error && <div className="card warn">Backend error: {cemeteryState.error}</div>}

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
            {cemeteryState.loading && <tr><td colSpan="4" className="meta">Loading...</td></tr>}
            {!cemeteryState.loading && cemeteries.length === 0 && <tr><td colSpan="4" className="meta">No cemeteries yet.</td></tr>}
            {!cemeteryState.loading && cemeteries.map((c) => (
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

      {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}

      {showCreateCemeteryWindow && (
        <div className="panel-overlay" onClick={() => {
          resetCreateForm();
          setShowCreateCemeteryWindow(false);
        }}>
          <div className="panel-window" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <h3>Create Cemetery</h3>
                <p className="meta">Add a new service location for memorials and jobs.</p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  resetCreateForm();
                  setShowCreateCemeteryWindow(false);
                }}
              >
                Close
              </button>
            </div>

            <form className="form" onSubmit={handleCreate}>
              <label>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />

              <label>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />

              <div className="field-row">
                <div>
                  <label>City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </div>
                <div>
                  <label>State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
                  />
                </div>
              </div>

              <label>Contact Name</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))}
              />

              <div className="field-row">
                <div>
                  <label>Contact Phone</label>
                  <input
                    type="text"
                    value={form.contact_phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, contact_phone: event.target.value }))}
                  />
                </div>
                <div>
                  <label>Contact Email</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
                  />
                </div>
              </div>

              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />

              {saveState.error && <div className="form-error">{saveState.error}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateCemeteryWindow(false);
                  }}
                >
                  Cancel
                </button>
                <button className="primary-btn" type="submit" disabled={saveState.loading}>
                  {saveState.loading ? 'Creating...' : 'Create Cemetery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ArchivePage({ sessionUser }) {
  const photosState = useApi('/photos/', [], true, { refreshEvent: 'hs:photos-updated' });
  const photos = Array.isArray(photosState.data) ? photosState.data : [];
  const isAdmin = sessionUser?.frontend_role === 'admin';

  return (
    <>
      <h1 className="page-title">Photos & Archive</h1>
      <p className="page-subtitle">Permanent visual records by memorial.</p>
      {photosState.error && <div className="card warn">Backend error: {photosState.error}</div>}
      <div className="card">
        {photosState.loading && <p className="meta">Loading photos...</p>}
        {!photosState.loading && photos.length === 0 && <p className="meta">No photos uploaded yet.</p>}
        {!photosState.loading && photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((photo) => (
              <article key={photo.id} className="photo-card">
                <div className="photo-card-media">
                  <img className="photo-card-image" src={photo.image_url} alt={photo.caption || photo.job_title || 'Archive photo'} />
                  <span className="photo-card-badge">{photo.photo_type_label}</span>
                </div>
                <div className="photo-card-body">
                  <strong className="photo-card-title">
                    {isAdmin
                      ? (photo.memorial_name || `Service #${photo.service_id || photo.id}`)
                      : (photo.job_title || `Service #${photo.service_id || photo.id}`)}
                  </strong>
                  <span className="photo-card-subtitle">
                    {isAdmin
                      ? (photo.job_title || `Service #${photo.service_id || photo.id}`)
                      : (photo.memorial_name || 'No memorial')}
                  </span>
                  <div className="photo-card-meta">{photo.cemetery_name || 'No cemetery'}</div>
                  {photo.caption && <p className="photo-card-caption">{photo.caption}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
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

function FrontDeskDashboardPage() {
  const { loading, error, summary, upcoming, recent } = useDashboardData(true);
  const customersState = useApi('/manage/customers/', []);
  const memorialsState = useApi('/memorials/', []);
  const servicesState = useApi('/scheduling/services/', []);

  const customers = Array.isArray(customersState.data) ? customersState.data : [];
  const memorials = Array.isArray(memorialsState.data) ? memorialsState.data : [];
  const services = Array.isArray(servicesState.data) ? servicesState.data : [];

  const unscheduledServices = services.filter((service) => !service.scheduled_start || service.status === 'draft');
  const overdueFollowups = customers.filter((customer) => !customer.last_contact).slice(0, 5);
  const recentCompleted = Array.isArray(recent) ? recent.slice(0, 4) : [];

  return (
    <>
      <h1 className="page-title">Front Desk Dashboard</h1>
      <p className="page-subtitle">Daily control center for intake, scheduling, customer follow-up, and email outreach.</p>

      {(error || customersState.error || memorialsState.error || servicesState.error) && (
        <div className="card warn">
          Backend error: {error || customersState.error || memorialsState.error || servicesState.error}
        </div>
      )}

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Projected Revenue</span>
          <strong>{summary ? formatCurrency(summary.projected_revenue || 0) : '—'}</strong>
          <small className="positive">Jobs scheduled, not completed</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Customers</span>
          <strong>{customersState.loading ? '—' : customers.length}</strong>
          <small>{customersState.loading ? 'Loading records' : 'Active customer records'}</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Unscheduled Jobs</span>
          <strong>{servicesState.loading ? '—' : unscheduledServices.length}</strong>
          <small>{servicesState.loading ? 'Loading jobs' : 'Needs front desk action'}</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Memorials</span>
          <strong>{memorialsState.loading ? '—' : memorials.length}</strong>
          <small>{memorialsState.loading ? 'Loading memorials' : 'Track and service status'}</small>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Priority Queue</h3>
            <a className="ghost-btn" href="#/frontdesk/scheduling">Open Scheduling</a>
          </div>
          <div className="compact-stack">
            <div className="queue-row">
              <strong>{unscheduledServices.length}</strong>
              <span>Jobs still need scheduling or technician assignment.</span>
            </div>
            <div className="queue-row">
              <strong>{summary?.services_today ?? 0}</strong>
              <span>Services are on the calendar for today.</span>
            </div>
            <div className="queue-row">
              <strong>{overdueFollowups.length}</strong>
              <span>Customers have no recent contact logged and may need a follow-up.</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Quick Actions</h3>
            <span className="meta">Most-used workflow shortcuts</span>
          </div>
          <div className="quick-links">
            <a className="quick-link-card" href="#/frontdesk/onboarding">
              <strong>New Intake</strong>
              <span>Add a customer and memorial request.</span>
            </a>
            <a className="quick-link-card" href="#/frontdesk/customers">
              <strong>Customer Records</strong>
              <span>Update contact info and manage accounts.</span>
            </a>
            <a className="quick-link-card" href="#/frontdesk/emails">
              <strong>Email Outreach</strong>
              <span>Send updates and reminders.</span>
            </a>
            <a className="quick-link-card" href="#/frontdesk/reports">
              <strong>Reports</strong>
              <span>Review revenue and operational status.</span>
            </a>
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <a className="ghost-btn" href="#/frontdesk/scheduling">View All</a>
          </div>
          {loading && <p className="meta">Loading upcoming services...</p>}
          {!loading && upcoming.length === 0 && <p className="meta">No upcoming services scheduled.</p>}
          {!loading && upcoming.length > 0 && (
            <ul className="service-list">
              {upcoming.slice(0, 5).map((service) => (
                <li key={service.id}>
                  <strong>{service.memorial_name || `Service #${service.id}`}</strong>
                  <span>{service.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">{formatDateTimeShort(service.scheduled_start)} · {service.status_display || service.status}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Recent Completed Jobs</h3>
            <span className="meta">Revenue already realized</span>
          </div>
          {loading && <p className="meta">Loading completed jobs...</p>}
          {!loading && recentCompleted.length === 0 && <p className="meta">No recently completed jobs.</p>}
          {!loading && recentCompleted.length > 0 && (
            <ul className="service-list">
              {recentCompleted.map((service) => (
                <li key={service.id}>
                  <strong>{service.memorial_name || `Service #${service.id}`}</strong>
                  <span>{service.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">{formatDateOnly(service.completed_date)} · {formatCurrency(Number(service.amount || 0))}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function EmailsPage() {
  const customerState = useApi('/customers/', []);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [manualRecipients, setManualRecipients] = useState('');
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
    () => (customerState.data || []).filter((customer) => Boolean(customer.email)),
    [customerState.data]
  );

  const selectedCustomers = useMemo(
    () => customersWithEmail.filter((customer) => selectedCustomerIds.includes(customer.id)),
    [customersWithEmail, selectedCustomerIds]
  );

  const parsedManualRecipients = useMemo(() => {
    return manualRecipients
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.*?)<([^>]+)>$/);
        if (match) {
          return { raw: line, name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
        }
        return { raw: line, name: '', email: line };
      });
  }, [manualRecipients]);

  function toggleCustomer(customerId) {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(customerId)) return prev.filter((id) => id !== customerId);
      return [...prev, customerId];
    });
  }

  function selectAll() {
    setSelectedCustomerIds(customersWithEmail.map((customer) => customer.id));
  }

  function clearAll() {
    setSelectedCustomerIds([]);
  }

  async function handleSend(event) {
    event.preventDefault();
    setSendState({ loading: true, error: '', result: null });

    if (!selectedCustomerIds.length && !parsedManualRecipients.length) {
      setSendState({ loading: false, error: 'Add at least one recipient.', result: null });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setSendState({ loading: false, error: 'Subject and body are required.', result: null });
      return;
    }

    const manualErrors = parsedManualRecipients
      .map((recipient) => {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email);
        return emailOk ? '' : `Invalid recipient: ${recipient.raw}`;
      })
      .filter(Boolean);
    if (manualErrors.length) {
      setSendState({ loading: false, error: manualErrors[0], result: null });
      return;
    }

    try {
      const res = await apiFetch('/emails/send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_ids: selectedCustomerIds,
          recipients: parsedManualRecipients.map((recipient) => ({
            email: recipient.email,
            name: recipient.name
          })),
          subject,
          body
        })
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
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
      <p className="page-subtitle">Send real outbound emails to customers or ad hoc recipients from one internal workflow.</p>

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
            <label>Manual Recipients</label>
            <textarea
              value={manualRecipients}
              onChange={(event) => setManualRecipients(event.target.value)}
              rows={4}
              placeholder={'One per line\nfriend@example.com\nJane Doe <jane@example.com>'}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <p className="meta">
              Send to selected customers and/or manual recipients. Manual recipients support `Name &lt;email@example.com&gt;`.
            </p>

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
            <p className="meta">
              Ready to send to {selectedCustomers.length + parsedManualRecipients.length} recipient
              {selectedCustomers.length + parsedManualRecipients.length === 1 ? '' : 's'}.
            </p>

            {sendState.error && <div className="form-error">{sendState.error}</div>}
            {sendState.loading && <div className="card form-success"><strong>Sending emails...</strong></div>}
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
          {sendState.result.ok && (
            <div className="card form-success"><strong>Emails sent successfully.</strong></div>
          )}
          {sendState.result.failed_count > 0 && (
            <div className="form-error">Some emails failed. Check backend logs/SMTP configuration.</div>
          )}
          {sendState.result.sent?.length > 0 && (
            <div className="compact-stack" style={{ marginTop: '12px' }}>
              {sendState.result.sent.map((row, index) => (
                <div key={`${row.email}-${index}`} className="queue-row">
                  <strong>OK</strong>
                  <div>
                    <div>{row.name || row.email}</div>
                    <span>{row.email}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {sendState.result.failed?.length > 0 && (
            <div className="compact-stack" style={{ marginTop: '12px' }}>
              {sendState.result.failed.map((row, index) => (
                <div key={`${row.email}-${index}`} className="queue-row">
                  <strong>!</strong>
                  <div>
                    <div>{row.name || row.email}</div>
                    <span>{row.error}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function getInvoiceStatusClass(status) {
  if (status === 'paid') return 'invoice-status invoice-status-paid';
  return 'invoice-status invoice-status-sent';
}

function AdminInvoicesPage() {
  const invoiceState = useApi('/manage/invoices/', [], true, { refreshEvent: 'hs:invoice-updated' });
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [subject, setSubject] = useState('Invoice #{{invoice_id}} for {{client_name}}');
  const [body, setBody] = useState(
    'Hello {{client_name}},\n\n'
    + 'Your invoice for {{service_name}} is ready.\n'
    + 'Amount due: {{amount_due}}\n'
    + 'Due date: {{due_date}}\n\n'
    + 'Pay securely here:\n'
    + '{{payment_link}}\n\n'
    + 'Best regards,\n'
    + 'Headstone Restoration'
  );
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [sendState, setSendState] = useState({ loading: false, error: '', success: '', checkoutUrl: '' });

  useEffect(() => {
    setInvoices(Array.isArray(invoiceState.data) ? invoiceState.data : []);
  }, [invoiceState.data]);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => String(invoice.id) === String(selectedInvoiceId)) || null,
    [invoices, selectedInvoiceId]
  );

  useEffect(() => {
    if (!invoices.length) return;
    if (selectedInvoiceId && selectedInvoice) return;
    const preferred = invoices.find((invoice) => invoice.status !== 'paid') || invoices[0];
    setSelectedInvoiceId(String(preferred.id));
  }, [invoices, selectedInvoiceId, selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) return;
    setDueDate(selectedInvoice.due_date || '');
    setNotes(selectedInvoice.notes || '');
    setSendState({ loading: false, error: '', success: '', checkoutUrl: '' });
  }, [selectedInvoiceId, selectedInvoice]);

  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status !== 'paid').length, [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'paid').length, [invoices]);
  const sentInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'sent').length, [invoices]);

  async function handleSend(event) {
    event.preventDefault();
    setSendState({ loading: true, error: '', success: '', checkoutUrl: '' });

    if (!selectedInvoice) {
      setSendState({ loading: false, error: 'Select an invoice first.', success: '', checkoutUrl: '' });
      return;
    }
    if (!selectedInvoice.customer_email) {
      setSendState({ loading: false, error: 'This client does not have an email address.', success: '', checkoutUrl: '' });
      return;
    }

    try {
      const res = await apiFetch(`/manage/invoices/${selectedInvoice.id}/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          due_date: dueDate || null,
          notes
        })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || `Invoice send failed (${res.status})`);
      }
      if (json.invoice) {
        setInvoices((prev) => prev.map((invoice) => (invoice.id === json.invoice.id ? json.invoice : invoice)));
      }
      window.dispatchEvent(new Event('hs:invoice-updated'));
      setSendState({
        loading: false,
        error: '',
        success: `Invoice emailed to ${json.sent_to}.`,
        checkoutUrl: json.checkout_url || ''
      });
    } catch (err) {
      setSendState({
        loading: false,
        error: err.message || 'Failed to send invoice.',
        success: '',
        checkoutUrl: ''
      });
    }
  }

  return (
    <>
      <h1 className="page-title">Invoices</h1>
      <p className="page-subtitle">Review invoices, personalize the message, and email Stripe payment links to clients.</p>

      {invoiceState.error && <div className="card warn">Backend error: {invoiceState.error}</div>}

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Invoices</span>
          <strong>{invoices.length}</strong>
          <small>{invoiceState.loading ? 'Loading...' : 'Across all customers'}</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Open</span>
          <strong>{openInvoices}</strong>
          <small>Draft or sent</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Sent</span>
          <strong>{sentInvoices}</strong>
          <small>Already emailed</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Paid</span>
          <strong>{paidInvoices}</strong>
          <small>Closed invoices</small>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Invoice Queue</h3>
              <p className="meta">Unpaid invoices stay at the top so you can send them quickly.</p>
            </div>
          </div>
          {invoiceState.loading && <p className="meta">Loading invoices...</p>}
          {!invoiceState.loading && invoices.length === 0 && <p className="meta">No invoices found.</p>}
          {!invoiceState.loading && invoices.length > 0 && (
            <div className="invoice-list">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  className="invoice-row"
                  onClick={() => setSelectedInvoiceId(String(invoice.id))}
                  style={{
                    textAlign: 'left',
                    borderColor: String(invoice.id) === String(selectedInvoiceId) ? '#1d4ed8' : undefined,
                    boxShadow: String(invoice.id) === String(selectedInvoiceId) ? '0 0 0 1px #1d4ed8 inset' : undefined
                  }}
                >
                  <div>
                    <div className="invoice-title">Invoice #{invoice.id} · {invoice.customer_name}</div>
                    <div className="meta">
                      {invoice.service_name || 'General invoice'} · {formatCurrency(Number(invoice.total_amount || 0))}
                    </div>
                    <div className="meta">
                      {invoice.customer_email || 'No email'} · Due {formatDateOnly(invoice.due_date) || '—'}
                    </div>
                  </div>
                  <div className="invoice-actions">
                    <span className={getInvoiceStatusClass(invoice.status)}>{invoice.status || 'draft'}</span>
                    <span className="meta">{invoice.items?.length || 0} item(s)</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Send Invoice</h3>
              <p className="meta">Each email is personalized per client and includes a Stripe-hosted payment link.</p>
            </div>
          </div>

          {selectedInvoice && (
            <div className="job-detail-summary">
              <strong>{selectedInvoice.customer_name}</strong>
              <span>{selectedInvoice.customer_email || 'No email on file'}</span>
              <div className="meta">
                Invoice #{selectedInvoice.id} · {selectedInvoice.service_name || 'General invoice'} · {formatCurrency(Number(selectedInvoice.total_amount || 0))}
              </div>
              <div className="meta">
                Status: {selectedInvoice.status || 'draft'} · Issued: {formatDateOnly(selectedInvoice.issued_date) || '—'} · Due: {formatDateOnly(selectedInvoice.due_date) || '—'}
              </div>
            </div>
          )}

          <form className="form" onSubmit={handleSend}>
            <label>Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(event) => setSelectedInvoiceId(event.target.value)}
              required
            >
              <option value="">Select an invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  #{invoice.id} · {invoice.customer_name} · {formatCurrency(Number(invoice.total_amount || 0))} · {invoice.status || 'draft'}
                </option>
              ))}
            </select>

            <label>Send To</label>
            <input
              type="text"
              value={selectedInvoice ? `${selectedInvoice.customer_name || 'Client'} <${selectedInvoice.customer_email || 'no-email'}>` : ''}
              readOnly
              placeholder="Select an invoice to choose the client"
            />

            <label>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Invoice subject"
            />

            <label>Body</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />

            <label>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />

            <label>Internal Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />

            <p className="meta">Tokens: {'{{client_name}}'}, {'{{first_name}}'}, {'{{invoice_id}}'}, {'{{amount_due}}'}, {'{{due_date}}'}, {'{{service_name}}'}, {'{{payment_link}}'}</p>

            {sendState.error && <div className="form-error">{sendState.error}</div>}
            {sendState.success && <div className="card form-success"><strong>{sendState.success}</strong></div>}
            {sendState.checkoutUrl && (
              <div className="meta">
                Checkout link ready: <a href={sendState.checkoutUrl} target="_blank" rel="noreferrer">{sendState.checkoutUrl}</a>
              </div>
            )}

            <button
              className="primary-btn"
              type="submit"
              disabled={sendState.loading || !selectedInvoice || selectedInvoice.status === 'paid'}
            >
              {sendState.loading ? 'Sending...' : 'Email Invoice'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

function AdminServiceOptionsManager() {
  const serviceOptionsState = useApi('/manage/service-options/?include_inactive=1', [], true, { refreshEvent: 'hs:service-options-updated' });
  const [form, setForm] = useState({ name: '', sort_order: '0' });
  const [saveState, setSaveState] = useState({ loading: false, error: '', success: '' });
  const [rowState, setRowState] = useState({ loadingId: null, error: '', success: '' });

  async function handleCreate(event) {
    event.preventDefault();
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch('/manage/service-options/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          sort_order: Number(form.sort_order) || 0,
          is_active: true
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Create failed (${res.status})`));
      setForm({ name: '', sort_order: '0' });
      setSaveState({ loading: false, error: '', success: 'Service added.' });
      window.dispatchEvent(new Event('hs:service-options-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to add service.', success: '' });
    }
  }

  async function handleToggle(option) {
    setRowState({ loadingId: option.id, error: '', success: '' });
    try {
      const res = await apiFetch(`/manage/service-options/${option.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !option.is_active })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Update failed (${res.status})`));
      setRowState({ loadingId: null, error: '', success: 'Service updated.' });
      window.dispatchEvent(new Event('hs:service-options-updated'));
    } catch (err) {
      setRowState({ loadingId: null, error: err.message || 'Failed to update service.', success: '' });
    }
  }

  async function handleDelete(optionId) {
    if (!window.confirm('Delete this service option?')) return;
    setRowState({ loadingId: optionId, error: '', success: '' });
    try {
      const res = await apiFetch(`/manage/service-options/${optionId}/`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
      setRowState({ loadingId: null, error: '', success: 'Service deleted.' });
      window.dispatchEvent(new Event('hs:service-options-updated'));
    } catch (err) {
      setRowState({ loadingId: null, error: err.message || 'Failed to delete service.', success: '' });
    }
  }

  return (
    <section className="grid-2">
      <div className="card">
        <h3>Service Catalog</h3>
        <p className="meta">Add the service names your team can schedule from the admin side.</p>
        <form className="form" onSubmit={handleCreate}>
          <label>Service Name</label>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Example: Bronze reset"
            required
          />
          <label>Sort Order</label>
          <input
            type="number"
            min="0"
            value={form.sort_order}
            onChange={(event) => setForm((prev) => ({ ...prev, sort_order: event.target.value }))}
          />
          {saveState.error && <div className="form-error">{saveState.error}</div>}
          {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
          <button className="primary-btn" type="submit" disabled={saveState.loading}>
            {saveState.loading ? 'Adding...' : 'Add Service'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Configured Services</h3>
        {serviceOptionsState.error && <div className="form-error">{serviceOptionsState.error}</div>}
        {rowState.error && <div className="form-error">{rowState.error}</div>}
        {rowState.success && <p className="meta">{rowState.success}</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Order</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {serviceOptionsState.loading && <tr><td colSpan="4" className="meta">Loading services...</td></tr>}
              {!serviceOptionsState.loading && serviceOptionsState.data.length === 0 && (
                <tr><td colSpan="4" className="meta">No service options yet.</td></tr>
              )}
              {!serviceOptionsState.loading && serviceOptionsState.data.map((option) => (
                <tr key={option.id}>
                  <td>{option.name}</td>
                  <td>{option.sort_order}</td>
                  <td>{option.is_active ? 'Active' : 'Inactive'}</td>
                  <td style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="ghost-btn"
                      onClick={() => handleToggle(option)}
                      disabled={rowState.loadingId === option.id}
                    >
                      {option.is_active ? 'Disable' : 'Enable'}
                    </button>
                    {!option.legacy_key && (
                      <button
                        className="ghost-btn"
                        onClick={() => handleDelete(option.id)}
                        disabled={rowState.loadingId === option.id}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SettingsPage(props) {
  if (props.sessionUser?.frontend_role === 'admin') {
    return (
      <>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your profile and the service catalog used when new jobs are created.</p>
        <AdminServiceOptionsManager />
        <UserSettingsPage {...props} hideHeader />
      </>
    );
  }
  return <UserSettingsPage {...props} />;
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
  const { loading, error, summary, upcoming, recent } = useDashboardData(true);

  const stats = [
    {
      label: 'Assigned Jobs',
      value: summary?.active_services ?? '—',
      sub: summary ? `${summary.services_today} on your calendar today` : 'Loading assignments'
    },
    {
      label: 'Completion Rate',
      value: summary ? formatPercent(summary.completion_rate || 0) : '—',
      sub: 'Your assigned jobs'
    }
  ];

  return (
    <>
      <h1 className="page-title">Crew Dashboard</h1>
      <p className="page-subtitle">Today's assignments, status updates, and photo tasks.</p>

      {error && <div className="card warn">Backend error: {error}</div>}

      <section className="kpis">
        {stats.map((stat) => (
          <div key={stat.label} className="kpi">
            <span className="kpi-label">{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.sub}</small>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Upcoming Assignments</h3>
          {loading && <p className="meta">Loading assignments...</p>}
          {!loading && upcoming.length === 0 && <p className="meta">No jobs assigned yet.</p>}
          {!loading && upcoming.length > 0 && (
            <ul className="service-list">
              {upcoming.map((svc) => (
                <li key={svc.id}>
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || 'Scheduled location'}</span>
                  <div className="meta">{formatDateTimeShort(svc.scheduled_start)} · {svc.status_display || svc.status}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Recently Completed</h3>
          {loading && <p className="meta">Loading completed jobs...</p>}
          {!loading && recent.length === 0 && <p className="meta">No completed jobs yet.</p>}
          {!loading && recent.length > 0 && (
            <ul className="service-list">
              {recent.map((svc) => (
                <li key={svc.id}>
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || '—'}</span>
                  <div className="meta">{formatDateOnly(svc.completed_date)} · {svc.amount != null ? formatCurrency(Number(svc.amount)) : 'No invoice yet'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function EmployeeSchedulingPage() {
  const servicesState = useApi('/scheduling/services/', [], true, { refreshEvent: 'hs:schedule-updated' });
  const [services, setServices] = useState([]);
  const [completeState, setCompleteState] = useState({ loading: false, error: '', success: '' });
  const [uploadState, setUploadState] = useState({ loading: false, error: '', success: '', serviceId: null });
  const [selectedServiceId, setSelectedServiceId] = useState('');

  useEffect(() => {
    setServices(Array.isArray(servicesState.data) ? servicesState.data : []);
  }, [servicesState.data]);

  const futureJobs = useMemo(
    () => services.filter((svc) => svc.status !== 'completed'),
    [services]
  );
  const pastJobs = useMemo(
    () => services.filter((svc) => svc.status === 'completed'),
    [services]
  );
  const selectedService = useMemo(
    () => services.find((svc) => String(svc.id) === String(selectedServiceId)) || null,
    [services, selectedServiceId]
  );

  async function handleMarkComplete(serviceId) {
    setCompleteState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch(`/manager/services/${serviceId}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        let payload;
        try {
          payload = await res.json();
        } catch (error) {
          payload = await res.text();
        }
        throw new Error(formatApiError(payload, `Complete failed (${res.status})`));
      }
      const json = await res.json();
      setServices((prev) => prev.filter((item) => item.id !== Number(serviceId)));
      if (String(selectedServiceId) === String(serviceId)) {
        setSelectedServiceId('');
      }
      window.dispatchEvent(new Event('hs:schedule-updated'));
      setCompleteState({
        loading: false,
        error: '',
        success: `${getServiceTypeLabel(json.service)} marked complete.`
      });
    } catch (err) {
      setCompleteState({ loading: false, error: err.message || 'Failed to complete job.', success: '' });
    }
  }

  async function handlePhotoChange(serviceId, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadState({ loading: true, error: '', success: '', serviceId });
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('photo_type', 'during');

      const res = await apiFetch(`/manager/services/${serviceId}/photos/`, {
        method: 'POST',
        body: formData
      });
      const raw = await res.text();
      let payload = raw;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch (error) {
        payload = raw;
      }
      if (!res.ok) {
        throw new Error(formatApiError(payload, `Upload failed (${res.status})`));
      }
      window.dispatchEvent(new Event('hs:photos-updated'));
      setUploadState({
        loading: false,
        error: '',
        success: 'Photo uploaded.',
        serviceId: null,
      });
    } catch (err) {
      setUploadState({
        loading: false,
        error: err.message || 'Failed to upload photo.',
        success: '',
        serviceId: null,
      });
    } finally {
      event.target.value = '';
    }
  }

  return (
    <>
      <h1 className="page-title">My Schedule</h1>
      <p className="page-subtitle">Crew assignments and upcoming services.</p>
      {(servicesState.error || completeState.error || uploadState.error) && (
        <div className="card warn">Backend error: {uploadState.error || completeState.error || servicesState.error}</div>
      )}
      {completeState.success && <div className="card success">{completeState.success}</div>}
      {uploadState.success && <div className="card success">{uploadState.success}</div>}

      <div className="card">
        <h3>Future Jobs</h3>
        {servicesState.loading && <p className="meta">Loading your schedule...</p>}
        {!servicesState.loading && futureJobs.length === 0 && <p className="meta">No upcoming assigned jobs right now.</p>}
        {!servicesState.loading && futureJobs.length > 0 && (
          <ul className="service-list">
            {futureJobs.map((svc) => (
              <li
                key={svc.id}
                className={`clickable-job-row${String(selectedServiceId) === String(svc.id) ? ' selected' : ''}`}
                onClick={() => setSelectedServiceId(String(svc.id))}
              >
                <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                <span>{svc.cemetery_name || 'Scheduled location'}</span>
                <div className="meta">
                  {formatDateTimeShort(svc.scheduled_start)} · {svc.status_display || svc.status || 'Scheduled'}
                </div>
                <div className="meta">
                  {getServiceTypeLabel(svc)}
                  {svc.estimated_minutes ? ` · ${svc.estimated_minutes} min` : ''}
                </div>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMarkComplete(svc.id);
                  }}
                  disabled={completeState.loading || svc.status === 'completed'}
                >
                  {completeState.loading ? 'Saving...' : 'Completed'}
                </button>
                <label className="ghost-btn file-upload-btn">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handlePhotoChange(svc.id, event)}
                    disabled={uploadState.loading}
                    onClick={(event) => event.stopPropagation()}
                    hidden
                  />
                  {uploadState.loading && uploadState.serviceId === svc.id ? 'Uploading...' : 'Add Photo'}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Past Jobs</h3>
        {servicesState.loading && <p className="meta">Loading history...</p>}
        {!servicesState.loading && pastJobs.length === 0 && <p className="meta">No past jobs yet.</p>}
        {!servicesState.loading && pastJobs.length > 0 && (
          <ul className="service-list">
            {pastJobs.map((svc) => (
              <li
                key={svc.id}
                className={`clickable-job-row${String(selectedServiceId) === String(svc.id) ? ' selected' : ''}`}
                onClick={() => setSelectedServiceId(String(svc.id))}
              >
                <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                <span>{svc.cemetery_name || 'Scheduled location'}</span>
                <div className="meta">Completed {formatDateOnly(svc.completed_date)}</div>
                <div className="meta">
                  {getServiceTypeLabel(svc)}
                  {svc.estimated_minutes ? ` · ${svc.estimated_minutes} min` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedService && (
        <div className="panel-overlay" onClick={() => setSelectedServiceId('')}>
          <div className="panel-window" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <h3>{selectedService.memorial_name || `Service #${selectedService.id}`}</h3>
                <p className="meta">Assigned job details for this technician visit.</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setSelectedServiceId('')}>
                Close
              </button>
            </div>

            <div className="job-detail-summary">
              <strong>{getServiceTypeLabel(selectedService)}</strong>
              <span>{selectedService.cemetery_name || 'Scheduled location pending'}</span>
              <div className="meta">
                {selectedService.status || 'scheduled'} · {selectedService.technician_name || 'Assigned technician'}
              </div>
            </div>

            <div className="survey-review-grid">
              <div><strong>Job ID</strong><span>#{selectedService.id}</span></div>
              <div><strong>Customer</strong><span>{selectedService.memorial_name || '—'}</span></div>
              <div><strong>Service</strong><span>{getServiceTypeLabel(selectedService)}</span></div>
              <div><strong>Status</strong><span>{selectedService.status || '—'}</span></div>
              <div><strong>Scheduled</strong><span>{formatDateTimeShort(selectedService.scheduled_start)}</span></div>
              <div><strong>Duration</strong><span>{selectedService.estimated_minutes ? `${selectedService.estimated_minutes} min` : '—'}</span></div>
              <div><strong>Cemetery</strong><span>{selectedService.cemetery_name || '—'}</span></div>
              <div><strong>Section</strong><span>{selectedService.section || '—'}</span></div>
              <div><strong>Row</strong><span>{selectedService.row || '—'}</span></div>
              <div><strong>Plot</strong><span>{selectedService.plot_number || '—'}</span></div>
              <div><strong>GPS</strong><span>{selectedService.gps_lat != null && selectedService.gps_lng != null ? `${selectedService.gps_lat}, ${selectedService.gps_lng}` : '—'}</span></div>
              <div><strong>Price</strong><span>{selectedService.price != null ? formatCurrency(Number(selectedService.price)) : '—'}</span></div>
              <div className="survey-review-block"><strong>Location Notes</strong><span>{selectedService.access_notes || selectedService.customer_locating_notes || '—'}</span></div>
              <div className="survey-review-block"><strong>Customer Notes</strong><span>{selectedService.customer_extra_notes || '—'}</span></div>
            </div>

            <div className="modal-actions">
              {selectedService.status !== 'completed' && (
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => handleMarkComplete(selectedService.id)}
                  disabled={completeState.loading}
                >
                  {completeState.loading ? 'Saving...' : 'Completed'}
                </button>
              )}
              <label className="ghost-btn file-upload-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoChange(selectedService.id, event)}
                  disabled={uploadState.loading}
                  hidden
                />
                {uploadState.loading && uploadState.serviceId === selectedService.id ? 'Uploading...' : 'Add Photo'}
              </label>
            </div>
          </div>
        </div>
      )}
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

function UserSettingsPage({ sessionUser, onSessionUserUpdate, hideHeader = false }) {
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    bio: '',
    profile_photo_url: ''
  });
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [state, setState] = useState({ loading: true, saving: false, error: '', success: '' });

  function applyProfileResponse(json, successMessage = 'Profile updated.') {
    setProfile({
      full_name: json.full_name || '',
      email: json.email || '',
      phone: json.phone || '',
      date_of_birth: json.date_of_birth || '',
      address_line1: json.address_line1 || '',
      address_line2: json.address_line2 || '',
      city: json.city || '',
      state: json.state || '',
      postal_code: json.postal_code || '',
      bio: json.bio || '',
      profile_photo_url: json.profile_photo_url || ''
    });
    setSelectedPhoto(null);
    setPhotoPreviewUrl('');
    setRemovePhoto(false);
    setState({ loading: false, saving: false, error: '', success: successMessage });
    if (typeof onSessionUserUpdate === 'function') {
      onSessionUserUpdate({
        ...sessionUser,
        full_name: json.full_name || sessionUser?.full_name || '',
        email: json.email || sessionUser?.email || '',
        phone: json.phone || sessionUser?.phone || '',
        profile_photo_url: json.profile_photo_url || ''
      });
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const res = await apiFetch('/auth/profile/');
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || `Profile load failed (${res.status})`);
        if (cancelled) return;
        setProfile({
          full_name: json.full_name || '',
          email: json.email || '',
          phone: json.phone || '',
          date_of_birth: json.date_of_birth || '',
          address_line1: json.address_line1 || '',
          address_line2: json.address_line2 || '',
          city: json.city || '',
          state: json.state || '',
          postal_code: json.postal_code || '',
          bio: json.bio || '',
          profile_photo_url: json.profile_photo_url || ''
        });
        setPhotoPreviewUrl('');
        setRemovePhoto(false);
        setState({ loading: false, saving: false, error: '', success: '' });
      } catch (err) {
        if (cancelled) return;
        setState({ loading: false, saving: false, error: err.message || 'Failed to load profile.', success: '' });
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, []);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  }

  async function handlePhotoChange(event) {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    setSelectedPhoto(file);
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setPhotoPreviewUrl(localPreview);
    setRemovePhoto(false);
    setState((prev) => ({ ...prev, saving: true, error: '', success: '' }));
    try {
      const formData = new FormData();
      formData.append('profile_photo', file);
      const res = await apiFetch('/auth/profile/', {
        method: 'PATCH',
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
      applyProfileResponse(json, 'Profile photo updated.');
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      setPhotoPreviewUrl('');
      setSelectedPhoto(null);
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err.message || 'Failed to upload profile photo.',
        success: ''
      }));
    }
  }

  async function handleRemovePhoto() {
    setSelectedPhoto(null);
    setPhotoPreviewUrl('');
    setRemovePhoto(true);
    setState((prev) => ({ ...prev, saving: true, error: '', success: '' }));
    try {
      const formData = new FormData();
      formData.append('remove_profile_photo', 'true');
      const res = await apiFetch('/auth/profile/', {
        method: 'PATCH',
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
      applyProfileResponse(json, 'Profile photo removed.');
    } catch (err) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err.message || 'Failed to remove profile photo.',
        success: ''
      }));
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    setState((prev) => ({ ...prev, saving: true, error: '', success: '' }));
    try {
      const formData = new FormData();
      Object.entries(profile).forEach(([key, value]) => {
        if (key === 'profile_photo_url') return;
        if (key === 'date_of_birth') {
          if (value) formData.append(key, value);
          return;
        }
        formData.append(key, value || '');
      });
      if (selectedPhoto) {
        formData.append('profile_photo', selectedPhoto);
      } else if (removePhoto) {
        formData.append('remove_profile_photo', 'true');
      }

      const res = await apiFetch('/auth/profile/', {
        method: 'PATCH',
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
      applyProfileResponse(json, 'Profile updated.');
    } catch (err) {
      setState({ loading: false, saving: false, error: err.message || 'Failed to save profile.', success: '' });
    }
  }

  return (
    <>
      {!hideHeader && (
        <>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your personal profile, contact details, and profile picture.</p>
        </>
      )}

      {state.error && <div className="card warn">Profile error: {state.error}</div>}

      <section className="grid-2">
        <div className="card">
          <h3>Profile Picture</h3>
          <div className="profile-photo-panel">
            {photoPreviewUrl || profile.profile_photo_url ? (
              <img className="profile-photo-preview" src={photoPreviewUrl || profile.profile_photo_url} alt="Profile" />
            ) : (
              <div className="profile-photo-empty">No photo</div>
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
            {state.saving && <p className="meta">Updating photo...</p>}
            {(photoPreviewUrl || profile.profile_photo_url || selectedPhoto) && (
              <button className="ghost-btn" type="button" onClick={handleRemovePhoto}>Remove Photo</button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Profile Details</h3>
          {state.loading ? (
            <p className="meta">Loading profile...</p>
          ) : (
            <form className="form" onSubmit={handleSave}>
              <label>Full Name</label>
              <input name="full_name" value={profile.full_name} onChange={handleInputChange} />

              <label>Email</label>
              <input type="email" name="email" value={profile.email} onChange={handleInputChange} />

              <label>Phone</label>
              <input type="tel" name="phone" value={profile.phone} onChange={handleInputChange} />

              <label>Date of Birth</label>
              <input type="date" name="date_of_birth" value={profile.date_of_birth} onChange={handleInputChange} />

              <label>Address Line 1</label>
              <input name="address_line1" value={profile.address_line1} onChange={handleInputChange} />

              <label>Address Line 2</label>
              <input name="address_line2" value={profile.address_line2} onChange={handleInputChange} />

              <div className="grid-3">
                <div>
                  <label>City</label>
                  <input name="city" value={profile.city} onChange={handleInputChange} />
                </div>
                <div>
                  <label>State</label>
                  <input name="state" value={profile.state} onChange={handleInputChange} />
                </div>
                <div>
                  <label>Postal Code</label>
                  <input name="postal_code" value={profile.postal_code} onChange={handleInputChange} />
                </div>
              </div>

              <label>Bio</label>
              <textarea name="bio" value={profile.bio} onChange={handleInputChange} rows={5} />

              {state.success && <div className="card form-success"><strong>{state.success}</strong></div>}
              <button className="primary-btn" type="submit" disabled={state.saving}>
                {state.saving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

function createCustomerFormState(overrides = {}) {
  return {
    full_name: '',
    email: '',
    phone: '',
    how_heard_about_us: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    notes: '',
    ...overrides
  };
}

function createCemeteryFormState(overrides = {}) {
  return {
    id: '',
    name: '',
    address: '',
    city: '',
    state: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
    ...overrides
  };
}

function createMemorialFormState(overrides = {}) {
  return {
    id: '',
    customer_id: '',
    customer: '',
    cemetery_id: '',
    cemetery: '',
    name_on_stone: '',
    material: 'other',
    stone_style: '',
    has_plaque: false,
    has_paint: false,
    decoration_notes: '',
    location_description: '',
    age_years: '',
    previous_cleaning_notes: '',
    notes: '',
    photo_names: [],
    regional_team: '',
    last_service_date: '',
    ...overrides
  };
}

function FormField({ label, hint, children, className = '' }) {
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function getCemeteryLookupText(cemetery) {
  return [
    cemetery?.name,
    cemetery?.address,
    cemetery?.city,
    cemetery?.state,
    cemetery?.contact_name,
    cemetery?.contact_phone,
    cemetery?.contact_email
  ]
    .filter(Boolean)
    .map((value) => normalizeLookup(value))
    .join(' ');
}

function getCemeterySummaryText(cemetery) {
  if (!cemetery) return 'No details available';
  const location = [cemetery.city, cemetery.state].filter(Boolean).join(', ');
  const address = cemetery.address || '';
  const contact = [cemetery.contact_name, cemetery.contact_phone].filter(Boolean).join(' · ');
  const bits = [address, location, contact].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'No additional details captured yet';
}

function CemeteryAutocompleteField({
  cemeteries,
  value,
  selectedCemetery,
  onChange,
  onSelectCemetery,
  onClearSelection,
  helperText = 'Type to find an existing cemetery or keep typing to create a new one.'
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const inputIdRef = useRef(`cemetery-${Math.random().toString(36).slice(2, 10)}`);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const query = normalizeLookup(value);
  const suggestions = useMemo(() => {
    const rows = Array.isArray(cemeteries) ? cemeteries : [];
    const matches = query
      ? rows.filter((cemetery) => getCemeteryLookupText(cemetery).includes(query))
      : rows;
    return matches.slice(0, 6);
  }, [cemeteries, query]);

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, suggestions.length]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  function handleSelect(cemetery) {
    if (!cemetery) return;
    onSelectCemetery?.(cemetery);
    setIsOpen(false);
    setActiveIndex(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (!suggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
      setIsOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      setIsOpen(true);
    } else if (event.key === 'Enter' && isOpen) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex] || suggestions[0]);
    }
  }

  return (
    <div className="cemetery-autocomplete" ref={containerRef}>
      <div className="field-label-row">
        <label htmlFor={inputIdRef.current}>Cemetery Name</label>
      </div>
      <div className="autocomplete-shell">
        <input
          id={inputIdRef.current}
          ref={inputRef}
          name="name"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Start typing a cemetery name"
          autoComplete="off"
          spellCheck="false"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
        />
        {selectedCemetery && <span className="autocomplete-selected-pill">Existing cemetery</span>}
      </div>
      <span className="field-hint">{helperText}</span>
      {selectedCemetery && (
        <div className="selected-record-banner">
          <div>
            <strong>{selectedCemetery.name}</strong>
            <span>{getCemeterySummaryText(selectedCemetery)}</span>
          </div>
          <button className="ghost-btn" type="button" onClick={onClearSelection}>
            Use new
          </button>
        </div>
      )}
      {isOpen && (
        <div className="autocomplete-menu" role="listbox">
          {suggestions.length > 0 ? (
            suggestions.map((cemetery, index) => (
              <button
                key={cemetery.id}
                type="button"
                className={`autocomplete-option${index === activeIndex ? ' active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(cemetery);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <strong>{cemetery.name}</strong>
                <span>{getCemeterySummaryText(cemetery)}</span>
              </button>
            ))
          ) : (
            <div className="autocomplete-empty">
              {cemeteries.length === 0
                ? 'No cemeteries saved yet. Keep typing to create a new one.'
                : 'No matching cemeteries found. Keep typing to create a new one.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function handleDraftFieldChange(setter, event) {
  const { name, value, type, checked } = event.target;
  setter((prev) => ({
    ...prev,
    [name]: type === 'checkbox' ? checked : value
  }));
}

function CustomerFormFields({ form, onChange }) {
  return (
    <div className="form-stack">
      <FormField label="Full Name">
        <input name="full_name" value={form.full_name} onChange={onChange} required />
      </FormField>

      <div className="field-row">
        <FormField label="Email">
          <input type="email" name="email" value={form.email} onChange={onChange} />
        </FormField>
        <FormField label="Phone">
          <input name="phone" value={form.phone} onChange={onChange} />
        </FormField>
      </div>

      <FormField
        label="How They Heard About Us"
        hint="Referral, cemetery office, search, repeat customer..."
      >
        <input
          name="how_heard_about_us"
          value={form.how_heard_about_us}
          onChange={onChange}
          placeholder="Referral, cemetery office, search, repeat customer..."
        />
      </FormField>

      <FormField label="Address Line 1">
        <input name="address_line1" value={form.address_line1} onChange={onChange} />
      </FormField>

      <FormField label="Address Line 2">
        <input name="address_line2" value={form.address_line2} onChange={onChange} />
      </FormField>

      <div className="grid-3">
        <FormField label="City">
          <input name="city" value={form.city} onChange={onChange} />
        </FormField>
        <FormField label="State">
          <input name="state" value={form.state} onChange={onChange} />
        </FormField>
        <FormField label="Postal Code">
          <input name="postal_code" value={form.postal_code} onChange={onChange} />
        </FormField>
      </div>

      <FormField label="Notes">
        <textarea name="notes" value={form.notes} onChange={onChange} rows={4} />
      </FormField>
    </div>
  );
}

function CemeteryFormFields({
  form,
  onChange,
  cemeteries = [],
  selectedCemetery = null,
  onSelectCemetery,
  onClearSelection,
  onNameChange,
  secondaryDisabled = false
}) {
  return (
    <div className="form-stack">
      <CemeteryAutocompleteField
        cemeteries={cemeteries}
        value={form.name}
        selectedCemetery={selectedCemetery}
        onChange={(nextValue) => {
          if (onNameChange) {
            onNameChange(nextValue, selectedCemetery);
            return;
          }
          onChange({
            target: { name: 'name', value: nextValue, type: 'text' }
          });
        }}
        onSelectCemetery={onSelectCemetery}
        onClearSelection={onClearSelection}
      />

      <FormField label="Address">
        <input name="address" value={form.address} onChange={onChange} disabled={secondaryDisabled} />
      </FormField>

      <div className="grid-3">
        <FormField label="City">
          <input name="city" value={form.city} onChange={onChange} disabled={secondaryDisabled} />
        </FormField>
        <FormField label="State">
          <input name="state" value={form.state} onChange={onChange} disabled={secondaryDisabled} />
        </FormField>
        <FormField label="Contact">
          <input name="contact_name" value={form.contact_name} onChange={onChange} disabled={secondaryDisabled} />
        </FormField>
      </div>

      <div className="field-row">
        <FormField label="Contact Phone">
          <input
            name="contact_phone"
            value={form.contact_phone}
            onChange={onChange}
            disabled={secondaryDisabled}
          />
        </FormField>
        <FormField label="Contact Email">
          <input
            type="email"
            name="contact_email"
            value={form.contact_email}
            onChange={onChange}
            disabled={secondaryDisabled}
          />
        </FormField>
      </div>

      <FormField label="Notes">
        <textarea name="notes" value={form.notes} onChange={onChange} rows={4} disabled={secondaryDisabled} />
      </FormField>
    </div>
  );
}

function MemorialFormFields({ form, onChange, onPhotoNamesChange }) {
  return (
    <div className="form-stack">
      <FormField label="Name On Stone">
        <input
          name="name_on_stone"
          value={form.name_on_stone}
          onChange={onChange}
          placeholder="John H. Andrews Bench"
        />
      </FormField>

      <div className="field-row">
        <FormField label="Stone Type">
          <select name="material" value={form.material} onChange={onChange}>
            {MATERIAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Style">
          <input
            name="stone_style"
            value={form.stone_style}
            onChange={onChange}
            placeholder="Flat, slab, upright..."
          />
        </FormField>
      </div>

      <div className="field-row checkbox-row">
        <label className="checkbox-card">
          <span className="checkbox-card-copy">Has plaque</span>
          <span className="checkbox-switch">
            <input type="checkbox" name="has_plaque" checked={Boolean(form.has_plaque)} onChange={onChange} />
            <span className="checkbox-switch-track" aria-hidden="true"></span>
          </span>
        </label>
        <label className="checkbox-card">
          <span className="checkbox-card-copy">Has paint</span>
          <span className="checkbox-switch">
            <input type="checkbox" name="has_paint" checked={Boolean(form.has_paint)} onChange={onChange} />
            <span className="checkbox-switch-track" aria-hidden="true"></span>
          </span>
        </label>
      </div>

      <div className="field-row">
        <FormField label="Stone Location">
          <input
            name="location_description"
            value={form.location_description}
            onChange={onChange}
            placeholder="Section, row, landmarks..."
          />
        </FormField>
        <FormField label="Approximate Age">
          <input
            type="number"
            min="0"
            name="age_years"
            value={form.age_years}
            onChange={onChange}
            placeholder="Years"
          />
        </FormField>
      </div>

      <FormField label="Vases / Flowers / Decorations">
        <textarea name="decoration_notes" value={form.decoration_notes} onChange={onChange} rows={3} />
      </FormField>

      <FormField label="Previous Cleans / Restoration Notes">
        <textarea
          name="previous_cleaning_notes"
          value={form.previous_cleaning_notes}
          onChange={onChange}
          rows={3}
        />
      </FormField>

      <FormField label="Additional Notes">
        <textarea name="notes" value={form.notes} onChange={onChange} rows={4} />
      </FormField>

      <FormField label="Reference Photos">
        <input
          type="file"
          multiple
          onChange={(event) => {
            const names = Array.from(event.target.files || []).map((file) => file.name);
            onPhotoNamesChange(names);
          }}
        />
      </FormField>
      {form.photo_names.length > 0 && (
        <div className="detail-pill-row">
          {form.photo_names.map((name) => (
            <span key={name} className="detail-pill">{name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardPageModern() {
  const { loading, error, summary, upcoming, recent } = useDashboardData(true);
  const servicesState = useApi('/scheduling/services/', [], true, { refreshEvent: 'hs:schedule-updated' });
  const workflowStore = useWorkflowStore();
  const revenueRows = useMemo(
    () => buildRevenueChartRows(recent, servicesState.data || []),
    [recent, servicesState.data]
  );

  const stats = [
    {
      label: 'Total Revenue',
      value: summary ? formatCurrency(summary.total_revenue || 0) : '-',
      sub: summary ? 'Completed work already collected' : 'Awaiting data'
    },
    {
      label: 'Projected Revenue',
      value: summary ? formatCurrency(summary.projected_revenue || 0) : '-',
      sub: summary ? 'Scheduled work still in the pipeline' : 'Awaiting data'
    },
    {
      label: 'Active Services',
      value: summary?.active_services ?? '-',
      sub: summary ? `${summary.services_today} on the calendar today` : 'Awaiting data'
    },
    {
      label: 'Onboarding Queue',
      value: workflowStore.localMemorials.length,
      sub: workflowStore.localMemorials.length ? 'Memorial intake records saved in the UI' : 'No local memorial intake drafts'
    }
  ];

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of restoration activity, revenue, onboarding, and service timing.</p>
        </div>
        <button className="primary-btn" type="button" onClick={() => openOnboardingWorkflow()}>
          Onboard Customer
        </button>
      </div>

      {(error || servicesState.error) && (
        <div className="card warn">Backend error: {error || servicesState.error}</div>
      )}

      <section className="kpis">
        {stats.map((stat) => (
          <div key={stat.label} className="kpi">
            <span className="kpi-label">{stat.label}</span>
            <strong>{stat.value}</strong>
            <small className={stat.label.includes('Revenue') ? 'positive' : ''}>{stat.sub}</small>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <button className="ghost-btn" type="button" onClick={() => { window.location.hash = getSchedulingPathForCurrentRole(); }}>
              View Calendar
            </button>
          </div>
          {loading && <p className="meta">Loading from backend...</p>}
          {!loading && upcoming.length === 0 && <p className="meta">No upcoming services scheduled.</p>}
          {!loading && upcoming.length > 0 && (
            <ul className="service-list">
              {upcoming.map((svc) => (
                <li key={svc.id}>
                  <strong>{svc.memorial_name || `Service #${svc.id}`}</strong>
                  <span>{svc.cemetery_name || 'Scheduled location'}</span>
                  <div className="meta">Service date: {formatDateTimeShort(svc.scheduled_start)}</div>
                  <div className="meta">{svc.status_display || svc.status || 'Scheduled'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Monthly Revenue</h3>
            <span className="meta">Collected vs scheduled snapshot</span>
          </div>
          <RevenueSnapshotChart rows={revenueRows} />
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
                  <td>{svc.cemetery_name || '-'}</td>
                  <td>{formatDateOnly(svc.completed_date)}</td>
                  <td>{svc.amount != null ? formatCurrency(Number(svc.amount)) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Customer Journey</h3>
            <button className="ghost-btn" type="button" onClick={() => openOnboardingWorkflow()}>
              Open Intake
            </button>
          </div>
          <p className="meta">Use onboarding to create a customer, attach a stone, and keep repeat memorial work nested under the same account.</p>
          <div className="compact-stack">
            <div className="queue-row">
              <strong>{workflowStore.localMemorials.length}</strong>
              <span>Memorial records added from the frontend workflow and ready for review.</span>
            </div>
            <div className="queue-row">
              <strong>{summary?.services_today ?? 0}</strong>
              <span>Service visits are already planned for today.</span>
            </div>
            <div className="queue-row">
              <strong>{upcoming.length}</strong>
              <span>Upcoming visits now show the service date directly on the dashboard.</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FrontDeskDashboardPageModern() {
  const { loading, error, summary, upcoming, recent } = useDashboardData(true);
  const customerState = useApi('/manage/customers/', [], true, { refreshEvent: 'hs:customers-updated' });
  const memorialState = useApi('/memorials/', []);
  const cemeteryState = useApi('/cemeteries/', []);
  const servicesState = useApi('/scheduling/services/', [], true, { refreshEvent: 'hs:schedule-updated' });
  const workflowStore = useWorkflowStore();
  const memorials = useMemo(
    () => buildMergedMemorials(memorialState.data || [], workflowStore),
    [memorialState.data, workflowStore]
  );
  const customers = useMemo(
    () => buildMergedCustomers(customerState.data || [], memorials, workflowStore),
    [customerState.data, memorials, workflowStore]
  );
  const cemeteries = useMemo(
    () => buildMergedCemeteries(cemeteryState.data || [], memorials, workflowStore),
    [cemeteryState.data, memorials, workflowStore]
  );
  const revenueRows = useMemo(
    () => buildRevenueChartRows(recent, servicesState.data || []),
    [recent, servicesState.data]
  );
  const unscheduledServices = (servicesState.data || []).filter((service) => !service.scheduled_start || service.status === 'draft');

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Front Desk Dashboard</h1>
          <p className="page-subtitle">Daily control center for onboarding, scheduling, customer follow-up, and cemetery visibility.</p>
        </div>
        <button className="primary-btn" type="button" onClick={() => openOnboardingWorkflow()}>
          Onboard Customer
        </button>
      </div>

      {(error || customerState.error || memorialState.error || cemeteryState.error || servicesState.error) && (
        <div className="card warn">
          Backend error: {error || customerState.error || memorialState.error || cemeteryState.error || servicesState.error}
        </div>
      )}

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Customers</span>
          <strong>{customers.length || '-'}</strong>
          <small>Active records available to the front desk</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Memorials</span>
          <strong>{memorials.length || '-'}</strong>
          <small>Stone records including local intake additions</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Unscheduled Jobs</span>
          <strong>{unscheduledServices.length || '-'}</strong>
          <small>Still need front desk action</small>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cemeteries</span>
          <strong>{cemeteries.length || '-'}</strong>
          <small>Known locations with memorial records</small>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Quick Actions</h3>
            <span className="meta">Most-used workflow shortcuts</span>
          </div>
          <div className="quick-links">
            <button className="quick-link-card quick-link-btn" type="button" onClick={() => openOnboardingWorkflow()}>
              <strong>Onboard Customer</strong>
              <span>Create a customer and attach a new stone record.</span>
            </button>
            <a className="quick-link-card" href="#/frontdesk/customers">
              <strong>Customer Records</strong>
              <span>Update contact info and add stones under an existing customer.</span>
            </a>
            <a className="quick-link-card" href="#/frontdesk/scheduling">
              <strong>Scheduling</strong>
              <span>Open the calendar and assign the service queue.</span>
            </a>
            <a className="quick-link-card" href="#/frontdesk/cemeteries">
              <strong>Cemeteries</strong>
              <span>Review cemetery info and all stones serviced there.</span>
            </a>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Monthly Revenue</h3>
            <span className="meta">Collected vs scheduled snapshot</span>
          </div>
          <RevenueSnapshotChart rows={revenueRows} />
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Services</h3>
            <a className="ghost-btn" href="#/frontdesk/scheduling">View All</a>
          </div>
          {loading && <p className="meta">Loading upcoming services...</p>}
          {!loading && upcoming.length === 0 && <p className="meta">No upcoming services scheduled.</p>}
          {!loading && upcoming.length > 0 && (
            <ul className="service-list">
              {upcoming.map((service) => (
                <li key={service.id}>
                  <strong>{service.memorial_name || `Service #${service.id}`}</strong>
                  <span>{service.cemetery_name || 'No cemetery'}</span>
                  <div className="meta">Service date: {formatDateTimeShort(service.scheduled_start)}</div>
                  <div className="meta">{service.status_display || service.status}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Service Snapshot</h3>
            <span className="meta">Front desk priorities right now</span>
          </div>
          <div className="compact-stack">
            <div className="queue-row">
              <strong>{workflowStore.localMemorials.length}</strong>
              <span>New memorial intake records were added through the frontend workflow.</span>
            </div>
            <div className="queue-row">
              <strong>{summary?.services_today ?? 0}</strong>
              <span>Services are on the schedule for today.</span>
            </div>
            <div className="queue-row">
              <strong>{unscheduledServices.length}</strong>
              <span>Jobs still need scheduling or technician assignment.</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function MemorialsPageModern() {
  const memorialState = useApi('/memorials/', []);
  const workflowStore = useWorkflowStore();
  const memorials = useMemo(
    () => buildMergedMemorials(memorialState.data || [], workflowStore),
    [memorialState.data, workflowStore]
  );
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState(createMemorialFormState());
  const [searchTerm, setSearchTerm] = useState('');
  const [saveState, setSaveState] = useState({ error: '', success: '' });
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredMemorials = useMemo(() => {
    if (!normalizedSearchTerm) return memorials;
    return memorials.filter((memorial) => {
      const searchIndex = [
        memorial.name_on_stone,
        memorial.customer,
        memorial.cemetery,
        memorial.material_label,
        memorial.stone_style,
        memorial.location_description,
        memorial.notes,
        memorial.regional_team
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchIndex.includes(normalizedSearchTerm);
    });
  }, [memorials, normalizedSearchTerm]);

  useEffect(() => {
    if (!memorials.length) {
      setSelectedId('');
      return;
    }
    const exists = memorials.some((row) => String(row.id) === String(selectedId));
    if (!exists) setSelectedId(String(memorials[0].id));
  }, [memorials, selectedId]);

  const selectedMemorial = useMemo(
    () => memorials.find((row) => String(row.id) === String(selectedId)) || null,
    [memorials, selectedId]
  );

  useEffect(() => {
    if (!selectedMemorial) return;
    setEditor(createMemorialFormState(selectedMemorial));
    setSaveState({ error: '', success: '' });
  }, [selectedMemorial]);

  function handleSave(event) {
    event.preventDefault();
    if (!selectedMemorial) return;
    if (selectedMemorial.source === 'local') {
      upsertLocalMemorial({ ...selectedMemorial, ...editor });
    } else {
      saveMemorialMeta(selectedMemorial.id, {
        name_on_stone: editor.name_on_stone,
        material: editor.material,
        stone_style: editor.stone_style,
        has_plaque: editor.has_plaque,
        has_paint: editor.has_paint,
        decoration_notes: editor.decoration_notes,
        location_description: editor.location_description,
        age_years: editor.age_years,
        previous_cleaning_notes: editor.previous_cleaning_notes,
        notes: editor.notes,
        photo_names: editor.photo_names,
        regional_team: editor.regional_team
      });
    }
    setSaveState({ error: '', success: 'Memorial details saved.' });
  }

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Memorials</h1>
          <p className="page-subtitle">Stone-focused records with clearer field grouping and a dedicated service snapshot.</p>
        </div>
        <button className="primary-btn" type="button" onClick={() => openOnboardingWorkflow()}>
          Add Memorial
        </button>
      </div>

      {memorialState.error && <div className="card warn">Backend error: {memorialState.error}</div>}

      <section className="grid-2 memorials-workspace">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Memorial Library</h3>
              <span className="meta">
                {filteredMemorials.length}
                {normalizedSearchTerm ? ` of ${memorials.length}` : ''} records
              </span>
            </div>
            <div className="entity-search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search stone, customer, cemetery..."
                aria-label="Search memorials"
              />
              {searchTerm && (
                <button className="ghost-btn" type="button" onClick={() => setSearchTerm('')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {memorialState.loading && <p className="meta">Loading memorials...</p>}
          {!memorialState.loading && memorials.length === 0 && <p className="meta">No memorials yet.</p>}
          {!memorialState.loading && memorials.length > 0 && filteredMemorials.length === 0 && (
            <p className="meta">No memorials match that search.</p>
          )}
          {!memorialState.loading && filteredMemorials.length > 0 && (
            <div className="record-stack">
              {filteredMemorials.map((memorial) => (
                <button
                  key={memorial.id}
                  type="button"
                  className={`record-card${String(selectedId) === String(memorial.id) ? ' active' : ''}`}
                  onClick={() => setSelectedId(String(memorial.id))}
                >
                  <div className="record-card-header">
                    <span className="stone-chip">Stone Record</span>
                    <span className="meta">{memorial.material_label}</span>
                  </div>
                  <strong>{memorial.name_on_stone || memorial.customer || 'Memorial record'}</strong>
                  <span>{memorial.cemetery || 'No cemetery listed'}</span>
                  <div className="record-card-meta">
                    <span>Customer: {memorial.customer || 'Unknown'}</span>
                    <span>Last service: {memorial.last_service_date ? formatDateOnly(memorial.last_service_date) : 'Not logged'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          {!selectedMemorial && <p className="meta">Select a memorial to review the stone details.</p>}
          {selectedMemorial && (
            <>
              <div className="memorial-hero">
                <div>
                  <div className="detail-kicker">Memorial detail</div>
                  <h3>{editor.name_on_stone || selectedMemorial.customer || 'Memorial record'}</h3>
                  <p className="meta">{getMaterialLabel(editor.material)}{editor.stone_style ? ` | ${editor.stone_style}` : ''}</p>
                </div>
                <div className="detail-pill-row">
                  <span className="detail-pill">{selectedMemorial.cemetery || 'No cemetery'}</span>
                  <span className="detail-pill">{selectedMemorial.customer || 'No customer'}</span>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-label">Service Snapshot</span>
                  <strong>{selectedMemorial.last_service_date ? formatDateOnly(selectedMemorial.last_service_date) : 'Not scheduled yet'}</strong>
                  <p>Regional team: {editor.regional_team || selectedMemorial.regional_team || 'Scheduling team'}</p>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Stone Location</span>
                  <strong>{editor.location_description || 'Capture location details here'}</strong>
                  <p>{editor.photo_names.length ? `${editor.photo_names.length} reference photo names saved` : 'No reference photo names saved yet'}</p>
                </div>
              </div>

              <form className="form" onSubmit={handleSave}>
                <MemorialFormFields
                  form={editor}
                  onChange={(event) => handleDraftFieldChange(setEditor, event)}
                  onPhotoNamesChange={(photoNames) => setEditor((prev) => ({ ...prev, photo_names: photoNames }))}
                />
                {saveState.error && <div className="form-error">{saveState.error}</div>}
                {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
                <button className="primary-btn" type="submit">Save Memorial Details</button>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function CustomersPageModern() {
  const customerState = useApi('/manage/customers/', [], true, { refreshEvent: 'hs:customers-updated' });
  const memorialState = useApi('/memorials/', []);
  const workflowStore = useWorkflowStore();
  const memorials = useMemo(
    () => buildMergedMemorials(memorialState.data || [], workflowStore),
    [memorialState.data, workflowStore]
  );
  const customers = useMemo(
    () => buildMergedCustomers(customerState.data || [], memorials, workflowStore),
    [customerState.data, memorials, workflowStore]
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createCustomerFormState());
  const [searchTerm, setSearchTerm] = useState('');
  const [saveState, setSaveState] = useState({ loading: false, error: '', success: '' });
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  useEffect(() => {
    if (!customers.length) {
      setSelectedCustomerId('');
      return;
    }
    const exists = customers.some((row) => String(row.id) === String(selectedCustomerId));
    if (!exists) {
      setSelectedCustomerId(String(customers[0].id));
      setEditingId(customers[0].id);
      setForm(createCustomerFormState(customers[0]));
    }
  }, [customers, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!normalizedSearchTerm) return customers;
    return customers.filter((customer) => {
      const relatedMemorials = memorials.filter((memorial) => matchesCustomerRecord(memorial, customer));
      const searchIndex = [
        customer.full_name,
        customer.email,
        customer.phone,
        customer.city,
        customer.state,
        customer.postal_code,
        customer.how_heard_about_us,
        customer.notes,
        ...relatedMemorials.flatMap((memorial) => [
          memorial.name_on_stone,
          memorial.customer,
          memorial.cemetery_name,
          memorial.plot_display
        ])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchIndex.includes(normalizedSearchTerm);
    });
  }, [customers, memorials, normalizedSearchTerm]);

  function startCreate() {
    setEditingId(null);
    setSelectedCustomerId('');
    setForm(createCustomerFormState());
    setSaveState({ loading: false, error: '', success: '' });
  }

  function startEdit(customer) {
    setEditingId(customer.id);
    setSelectedCustomerId(String(customer.id));
    setForm(createCustomerFormState(customer));
    setSaveState({ loading: false, error: '', success: '' });
  }

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId]
  );

  const selectedCustomerMemorials = useMemo(
    () => memorials.filter((memorial) => selectedCustomer && matchesCustomerRecord(memorial, selectedCustomer)),
    [memorials, selectedCustomer]
  );

  async function handleSave(event) {
    event.preventDefault();
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        notes: form.notes
      };
      const isEdit = Boolean(editingId);
      const res = await apiFetch(isEdit ? `/manage/customers/${editingId}/` : '/manage/customers/', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json, `Save failed (${res.status})`));
      saveCustomerMeta(json.customer.id, {
        how_heard_about_us: form.how_heard_about_us,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        notes: form.notes
      });
      setEditingId(json.customer.id);
      setSelectedCustomerId(String(json.customer.id));
      setForm(createCustomerFormState({ ...form, ...json.customer }));
      setSaveState({ loading: false, error: '', success: isEdit ? 'Customer updated.' : 'Customer created.' });
      window.dispatchEvent(new Event('hs:customers-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to save customer.', success: '' });
    }
  }

  async function handleDelete(customerId) {
    if (!window.confirm('Delete this customer?')) return;
    setSaveState({ loading: true, error: '', success: '' });
    try {
      const res = await apiFetch(`/manage/customers/${customerId}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setSaveState({ loading: false, error: '', success: 'Customer deleted.' });
      startCreate();
      window.dispatchEvent(new Event('hs:customers-updated'));
    } catch (err) {
      setSaveState({ loading: false, error: err.message || 'Failed to delete customer.', success: '' });
    }
  }

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Manage contact records and add more stones under an existing customer profile.</p>
        </div>
        <button className="primary-btn" type="button" onClick={() => openOnboardingWorkflow()}>
          Onboard Customer
        </button>
      </div>

      {(customerState.error || memorialState.error) && (
        <div className="card warn">Backend error: {customerState.error || memorialState.error}</div>
      )}

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>{editingId ? `Customer #${editingId}` : 'New Customer'}</h3>
            <button className="ghost-btn" type="button" onClick={startCreate}>Clear</button>
          </div>
          <form className="form" onSubmit={handleSave}>
            <CustomerFormFields form={form} onChange={(event) => handleDraftFieldChange(setForm, event)} />
            {saveState.error && <div className="form-error">{saveState.error}</div>}
            {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
            <button className="primary-btn" type="submit" disabled={saveState.loading}>
              {saveState.loading ? 'Saving...' : (editingId ? 'Save Customer' : 'Create Customer')}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Customer List</h3>
              <span className="meta">
                {filteredCustomers.length}
                {normalizedSearchTerm ? ` of ${customers.length}` : ''} records
              </span>
            </div>
            <div className="customer-search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, email, phone, cemetery..."
                aria-label="Search customers"
              />
              {searchTerm && (
                <button className="ghost-btn" type="button" onClick={() => setSearchTerm('')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Memorials</th>
                  <th>Email</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerState.loading && <tr><td colSpan="4" className="meta">Loading customers...</td></tr>}
                {!customerState.loading && customers.length === 0 && <tr><td colSpan="4" className="meta">No customers yet.</td></tr>}
                {!customerState.loading && customers.length > 0 && filteredCustomers.length === 0 && (
                  <tr><td colSpan="4" className="meta">No customers match that search.</td></tr>
                )}
                {!customerState.loading && filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.full_name}</strong>
                      <div className="meta">{customer.how_heard_about_us || 'Referral source not captured yet'}</div>
                    </td>
                    <td>{customer.memorials_count || 0}</td>
                    <td>{customer.email || '-'}</td>
                    <td>
                      <div className="table-action-cell">
                        <button className="ghost-btn" type="button" onClick={() => startEdit(customer)}>Edit</button>
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={() => openOnboardingWorkflow({
                            existing_customer_id: customer.id,
                            customer_name: customer.full_name
                          })}
                        >
                          Add Stone
                        </button>
                        <button className="ghost-btn" type="button" onClick={() => handleDelete(customer.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Selected Customer</h3>
            {selectedCustomer && (
              <button
                className="ghost-btn"
                type="button"
                onClick={() => openOnboardingWorkflow({
                  existing_customer_id: selectedCustomer.id,
                  customer_name: selectedCustomer.full_name
                })}
              >
                Add Memorial
              </button>
            )}
          </div>
          {!selectedCustomer && <p className="meta">Select a customer to review their profile.</p>}
          {selectedCustomer && (
            <div className="detail-grid">
              <div className="detail-card">
                <span className="detail-label">Contact</span>
                <strong>{selectedCustomer.full_name}</strong>
                <p>{selectedCustomer.email || 'No email saved'}</p>
                <p>{selectedCustomer.phone || 'No phone saved'}</p>
              </div>
              <div className="detail-card">
                <span className="detail-label">Referral Source</span>
                <strong>{selectedCustomer.how_heard_about_us || 'Not captured'}</strong>
                <p>{selectedCustomer.last_contact ? `Last contact ${formatDateOnly(selectedCustomer.last_contact)}` : 'No last contact logged'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Memorials Under This Customer</h3>
          {!selectedCustomer && <p className="meta">Select a customer first.</p>}
          {selectedCustomer && selectedCustomerMemorials.length === 0 && (
            <p className="meta">No memorials are attached to this customer yet.</p>
          )}
          {selectedCustomer && selectedCustomerMemorials.length > 0 && (
            <div className="record-stack compact-record-stack">
              {selectedCustomerMemorials.map((memorial) => (
                <div key={memorial.id} className="record-card record-card-static">
                  <div className="record-card-header">
                    <span className="stone-chip">Stone</span>
                    <span className="meta">{memorial.material_label}</span>
                  </div>
                  <strong>{memorial.name_on_stone || memorial.customer || 'Memorial record'}</strong>
                  <span>{memorial.cemetery || 'No cemetery listed'}</span>
                  <div className="record-card-meta">
                    <span>{memorial.location_description || 'Location details not captured yet'}</span>
                    <span>{memorial.last_service_date ? `Last service ${formatDateOnly(memorial.last_service_date)}` : 'No service logged'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function CemeteriesPageModern() {
  const cemeteryState = useApi('/cemeteries/', []);
  const memorialState = useApi('/memorials/', []);
  const workflowStore = useWorkflowStore();
  const memorials = useMemo(
    () => buildMergedMemorials(memorialState.data || [], workflowStore),
    [memorialState.data, workflowStore]
  );
  const cemeteries = useMemo(
    () => buildMergedCemeteries(cemeteryState.data || [], memorials, workflowStore),
    [cemeteryState.data, memorials, workflowStore]
  );
  const [selectedCemeteryId, setSelectedCemeteryId] = useState('');
  const [form, setForm] = useState(createCemeteryFormState());
  const [saveState, setSaveState] = useState({ success: '' });

  const selectedCemetery = useMemo(
    () => cemeteries.find((cemetery) => String(cemetery.id) === String(selectedCemeteryId)) || null,
    [cemeteries, selectedCemeteryId]
  );

  useEffect(() => {
    if (!selectedCemetery) return;
    setForm(createCemeteryFormState(selectedCemetery));
    setSaveState({ success: '' });
  }, [selectedCemetery]);

  function handleSelectCemetery(cemetery) {
    if (!cemetery) return;
    setSelectedCemeteryId(String(cemetery.id));
    setForm(createCemeteryFormState(cemetery));
    setSaveState({ success: '' });
  }

  function handleClearSelection() {
    setSelectedCemeteryId('');
    setForm(createCemeteryFormState());
    setSaveState({ success: '' });
  }

  const cemeteryMemorials = useMemo(
    () => memorials.filter((memorial) => selectedCemetery && matchesCemeteryRecord(memorial, selectedCemetery)),
    [memorials, selectedCemetery]
  );

  function handleSave(event) {
    event.preventDefault();
    const nextRecord = { ...form };
    if (!nextRecord.id) {
      nextRecord.id = makeLocalId('cemetery');
      upsertLocalCemetery(nextRecord);
      setSelectedCemeteryId(String(nextRecord.id));
    } else if (String(nextRecord.id).startsWith('local-')) {
      upsertLocalCemetery(nextRecord);
    } else {
      saveCemeteryMeta(nextRecord.id, nextRecord);
    }
    setSaveState({ success: 'Cemetery details saved.' });
  }

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Cemeteries</h1>
          <p className="page-subtitle">Capture the cemetery info first, then review every stone serviced inside that location.</p>
        </div>
        <button className="primary-btn" type="button" onClick={() => openOnboardingWorkflow()}>
          Add Stone Intake
        </button>
      </div>

      {(cemeteryState.error || memorialState.error) && (
        <div className="card warn">Backend error: {cemeteryState.error || memorialState.error}</div>
      )}

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>{form.id ? 'Cemetery Details' : 'New Cemetery'}</h3>
            <button
              className="ghost-btn"
              type="button"
              onClick={handleClearSelection}
            >
              New
            </button>
          </div>
          <form className="form" onSubmit={handleSave}>
            <CemeteryFormFields
              form={form}
              cemeteries={cemeteries}
              selectedCemetery={selectedCemetery}
              onSelectCemetery={handleSelectCemetery}
              onClearSelection={handleClearSelection}
              onNameChange={(nextValue) => setForm((prev) => ({ ...prev, name: nextValue }))}
              onChange={(event) => handleDraftFieldChange(setForm, event)}
            />
            {saveState.success && <div className="card form-success"><strong>{saveState.success}</strong></div>}
            <button className="primary-btn" type="submit">Save Cemetery</button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Cemetery List</h3>
            <span className="meta">{cemeteries.length} locations</span>
          </div>
          <div className="record-stack">
            {cemeteries.map((cemetery) => (
              <button
                key={cemetery.id}
                type="button"
                className={`record-card${String(selectedCemeteryId) === String(cemetery.id) ? ' active' : ''}`}
                onClick={() => handleSelectCemetery(cemetery)}
              >
                <strong>{cemetery.name}</strong>
                <span>{[cemetery.city, cemetery.state].filter(Boolean).join(', ') || 'City and state not captured yet'}</span>
                <div className="record-card-meta">
                  <span>{cemetery.address || 'No address saved'}</span>
                  <span>{cemetery.memorials_count || 0} stones</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="card">
        <div className="card-header">
          <h3>Stones In This Cemetery</h3>
          <span className="meta">Customer info intentionally hidden here</span>
        </div>
        {!selectedCemetery && <p className="meta">Select a cemetery first.</p>}
        {selectedCemetery && cemeteryMemorials.length === 0 && (
          <p className="meta">No stones are attached to this cemetery yet.</p>
        )}
        {selectedCemetery && cemeteryMemorials.length > 0 && (
          <div className="record-stack compact-record-stack">
            {cemeteryMemorials.map((memorial) => (
              <div key={memorial.id} className="record-card record-card-static">
                <div className="record-card-header">
                  <span className="stone-chip">Stone</span>
                  <span className="meta">{memorial.material_label}</span>
                </div>
                <strong>{memorial.name_on_stone || 'Memorial record'}</strong>
                <span>{memorial.location_description || 'Location details not captured yet'}</span>
                <div className="record-card-meta">
                  <span>{memorial.stone_style || 'Style not captured'}</span>
                  <span>{memorial.last_service_date ? `Last service ${formatDateOnly(memorial.last_service_date)}` : 'No service logged'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OnboardingPageModern() {
  const customerState = useApi('/manage/customers/', [], true, { refreshEvent: 'hs:customers-updated' });
  const cemeteryState = useApi('/cemeteries/', []);
  const workflowStore = useWorkflowStore();
  const draft = useMemo(() => readOnboardingDraft(), []);
  const cemeteries = useMemo(
    () => buildMergedCemeteries(cemeteryState.data || [], [], workflowStore),
    [cemeteryState.data, workflowStore]
  );
  const customers = Array.isArray(customerState.data) ? customerState.data : [];
  const [customerMode, setCustomerMode] = useState(draft.existing_customer_id ? 'existing' : 'new');
  const [selectedCustomerId, setSelectedCustomerId] = useState(String(draft.existing_customer_id || ''));
  const [customerForm, setCustomerForm] = useState(createCustomerFormState({
    full_name: draft.customer_name || ''
  }));
  const [selectedCemeteryId, setSelectedCemeteryId] = useState(String(draft.existing_cemetery_id || ''));
  const [cemeteryForm, setCemeteryForm] = useState(createCemeteryFormState());
  const [memorialForm, setMemorialForm] = useState(createMemorialFormState());
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const selectedCemetery = useMemo(
    () => cemeteries.find((cemetery) => String(cemetery.id) === String(selectedCemeteryId)) || null,
    [cemeteries, selectedCemeteryId]
  );

  useEffect(() => {
    if (!selectedCemetery) return;
    setCemeteryForm(createCemeteryFormState(selectedCemetery));
  }, [selectedCemetery]);

  function handleClearDraft() {
    clearOnboardingDraft();
    setCustomerMode('new');
    setSelectedCustomerId('');
    setCustomerForm(createCustomerFormState());
    setSelectedCemeteryId('');
    setCemeteryForm(createCemeteryFormState());
    setMemorialForm(createMemorialFormState());
    setSubmitState({ loading: false, error: '', success: '' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitState({ loading: true, error: '', success: '' });
    try {
      let customerRecord = null;

      if (customerMode === 'existing') {
        customerRecord = customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null;
        if (!customerRecord) throw new Error('Select an existing customer.');
      } else {
        const payload = {
          full_name: customerForm.full_name,
          email: customerForm.email,
          phone: customerForm.phone,
          address_line1: customerForm.address_line1,
          address_line2: customerForm.address_line2,
          city: customerForm.city,
          state: customerForm.state,
          postal_code: customerForm.postal_code,
          notes: customerForm.notes
        };
        const res = await apiFetch('/manage/customers/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(formatApiError(json, `Create failed (${res.status})`));
        customerRecord = json.customer;
        window.dispatchEvent(new Event('hs:customers-updated'));
      }

      saveCustomerMeta(customerRecord.id, {
        how_heard_about_us: customerForm.how_heard_about_us,
        address_line1: customerForm.address_line1,
        address_line2: customerForm.address_line2,
        city: customerForm.city,
        state: customerForm.state,
        postal_code: customerForm.postal_code,
        notes: customerForm.notes
      });

      let cemeteryRecord = null;
      if (selectedCemeteryId) {
        cemeteryRecord = cemeteries.find((cemetery) => String(cemetery.id) === String(selectedCemeteryId)) || null;
        if (!cemeteryRecord) throw new Error('Select an existing cemetery.');
      } else {
        cemeteryRecord = {
          ...cemeteryForm,
          id: makeLocalId('cemetery')
        };
        upsertLocalCemetery(cemeteryRecord);
      }

      const memorialRecord = {
        ...memorialForm,
        id: makeLocalId('memorial'),
        customer_id: customerRecord.id,
        customer: customerRecord.full_name,
        cemetery_id: cemeteryRecord.id,
        cemetery: cemeteryRecord.name,
        name_on_stone: memorialForm.name_on_stone || customerRecord.full_name
      };
      upsertLocalMemorial(memorialRecord);
      clearOnboardingDraft();
      setSubmitState({ loading: false, error: '', success: 'Customer and memorial intake saved.' });
      setCustomerMode('new');
      setSelectedCustomerId('');
      setCustomerForm(createCustomerFormState());
      setSelectedCemeteryId('');
      setCemeteryForm(createCemeteryFormState());
      setMemorialForm(createMemorialFormState());
    } catch (err) {
      setSubmitState({ loading: false, error: err.message || 'Failed to save onboarding.', success: '' });
    }
  }

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-subtitle">Create a customer, capture how they found you, and attach a stone under the right cemetery.</p>
        </div>
        <button className="ghost-btn" type="button" onClick={handleClearDraft}>Clear Draft</button>
      </div>

      {(customerState.error || cemeteryState.error) && (
        <div className="card warn">Backend error: {customerState.error || cemeteryState.error}</div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <section className="grid-2">
          <div className="card">
            <div className="card-header">
              <h3>Customer</h3>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn${customerMode === 'new' ? ' active' : ''}`}
                  onClick={() => setCustomerMode('new')}
                >
                  New
                </button>
                <button
                  type="button"
                  className={`toggle-btn${customerMode === 'existing' ? ' active' : ''}`}
                  onClick={() => setCustomerMode('existing')}
                >
                  Existing
                </button>
              </div>
            </div>
            {customerMode === 'existing' && (
              <>
                <label>Existing Customer</label>
                <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} required>
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.full_name}</option>
                  ))}
                </select>
                <label>How They Heard About Us</label>
                <input
                  name="how_heard_about_us"
                  value={customerForm.how_heard_about_us}
                  onChange={(event) => handleDraftFieldChange(setCustomerForm, event)}
                />
              </>
            )}
            {customerMode === 'new' && (
              <CustomerFormFields form={customerForm} onChange={(event) => handleDraftFieldChange(setCustomerForm, event)} />
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Cemetery</h3>
              <span className="meta">Type to pick an existing cemetery or create a new one.</span>
            </div>
            <CemeteryFormFields
              form={cemeteryForm}
              cemeteries={cemeteries}
              selectedCemetery={selectedCemetery}
              onSelectCemetery={(cemetery) => {
                setSelectedCemeteryId(String(cemetery.id));
                setCemeteryForm(createCemeteryFormState(cemetery));
              }}
              onClearSelection={() => {
                setSelectedCemeteryId('');
                setCemeteryForm(createCemeteryFormState());
              }}
              onNameChange={(nextValue) => {
                const currentSelected = selectedCemetery;
                const shouldClearSelection = Boolean(
                  currentSelected && normalizeLookup(currentSelected.name) !== normalizeLookup(nextValue)
                );
                setCemeteryForm((prev) => ({
                  ...prev,
                  name: nextValue,
                  ...(shouldClearSelection ? { id: '' } : {})
                }));
                if (shouldClearSelection) {
                  setSelectedCemeteryId('');
                }
              }}
              onChange={(event) => handleDraftFieldChange(setCemeteryForm, event)}
              secondaryDisabled={Boolean(selectedCemeteryId)}
            />
          </div>
        </section>

        <div className="card">
          <h3>Stone Information</h3>
          <MemorialFormFields
            form={memorialForm}
            onChange={(event) => handleDraftFieldChange(setMemorialForm, event)}
            onPhotoNamesChange={(photoNames) => setMemorialForm((prev) => ({ ...prev, photo_names: photoNames }))}
          />
        </div>

        {submitState.error && <div className="form-error">{submitState.error}</div>}
        {submitState.success && <div className="card form-success"><strong>{submitState.success}</strong></div>}
        <button className="primary-btn" type="submit" disabled={submitState.loading}>
          {submitState.loading ? 'Saving...' : 'Save Onboarding Record'}
        </button>
      </form>
    </>
  );
}

ROUTES.admin.dashboard = DashboardPageModern;
ROUTES.admin.memorials = MemorialsPageModern;
ROUTES.admin.customers = CustomersPageModern;
ROUTES.admin.cemeteries = CemeteriesPageModern;
ROUTES.admin.onboarding = OnboardingPageModern;
ROUTES.frontdesk.dashboard = FrontDeskDashboardPageModern;
ROUTES.frontdesk.memorials = MemorialsPageModern;
ROUTES.frontdesk.customers = CustomersPageModern;
ROUTES.frontdesk.cemeteries = CemeteriesPageModern;
ROUTES.frontdesk.onboarding = OnboardingPageModern;

function LoginPage({ form, authState, onChange, onSubmit }) {
  return (
    <div className="main main-login">
      <header className="topbar topbar-login"></header>
      <main className="content">
        <h1 className="page-title">Login</h1>
        <p className="page-subtitle">Sign in with your email or username and password.</p>

        <div className="card auth-card">
          <form className="form" onSubmit={onSubmit}>
            {authState.loading && <p className="meta">Checking session...</p>}

            <label>Email or Username</label>
            <input
              type="text"
              name="email"
              autoComplete="username"
              value={form.email}
              onChange={onChange}
              required
            />

            <label>Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={onChange}
              required
            />

            {authState.error && <div className="form-error">{authState.error}</div>}
            <button className="primary-btn" type="submit" disabled={authState.submitting}>
              {authState.submitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function SetupPasswordPage({ onComplete }) {
  const inviteToken = getInviteToken();
  const [state, setState] = useState({
    loading: true,
    submitting: false,
    invite: null,
    password: '',
    passwordConfirm: '',
    error: ''
  });

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!inviteToken) {
        setState((prev) => ({ ...prev, loading: false, error: 'Missing invite token.' }));
        return;
      }
      try {
        const res = await apiFetch(`/auth/password-setup/?token=${encodeURIComponent(inviteToken)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || `Invite lookup failed (${res.status})`);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          invite: json.invite,
          error: ''
        }));
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Invite is invalid or expired.'
        }));
      }
    }

    loadInvite();
    return () => { cancelled = true; };
  }, [inviteToken]);

  async function handleSubmit(event) {
    event.preventDefault();
    setState((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      const res = await apiFetch('/auth/password-setup/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          password: state.password,
          password_confirm: state.passwordConfirm
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
      onComplete(json.user);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        error: err.message || 'Failed to set password.'
      }));
    }
  }

  return (
    <div className="main main-login">
      <header className="topbar topbar-login"></header>
      <main className="content">
        <h1 className="page-title">Set Password</h1>
        <p className="page-subtitle">Finish setting up your employee account.</p>

        <div className="card auth-card">
          {state.loading && <p className="meta">Checking invite...</p>}
          {!state.loading && state.invite && (
            <form className="form" onSubmit={handleSubmit}>
              <p className="meta">
                {state.invite.full_name} · {state.invite.email} · {state.invite.role}
              </p>
              <label>New Password</label>
              <input
                type="password"
                value={state.password}
                onChange={(event) => setState((prev) => ({ ...prev, password: event.target.value }))}
                required
              />

              <label>Confirm Password</label>
              <input
                type="password"
                value={state.passwordConfirm}
                onChange={(event) => setState((prev) => ({ ...prev, passwordConfirm: event.target.value }))}
                required
              />

              {state.error && <div className="form-error">{state.error}</div>}
              <button className="primary-btn" type="submit" disabled={state.submitting}>
                {state.submitting ? 'Saving...' : 'Set Password'}
              </button>
            </form>
          )}
          {!state.loading && !state.invite && state.error && <div className="form-error">{state.error}</div>}
        </div>
      </main>
    </div>
  );
}

function Layout({ role, sessionUser, navItems, currentPath, onLogout, children }) {
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
          <div className="search">
            <input type="text" placeholder="Search memorials, customers, cemeteries, GPS..." />
          </div>

          <div className="topbar-actions">
            <div className="role-chip">
              <strong>{sessionUser?.full_name || sessionUser?.username || 'User'}</strong>
              <span>{ROLE_CONFIGS[role]?.label || role}</span>
            </div>
            <button className="ghost-btn" type="button" onClick={onLogout}>Logout</button>
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
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authState, setAuthState] = useState({
    loading: true,
    submitting: false,
    authenticated: false,
    user: null,
    error: ''
  });

  const sessionRole = authState.user?.frontend_role || null;
  const route = useMemo(() => parseRoute(path, sessionRole), [path, sessionRole]);
  const { role, page, config, canonicalPath } = route;

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await apiFetch('/auth/session/');
        const json = await res.json();
        if (cancelled) return;
        setAuthState({
          loading: false,
          submitting: false,
          authenticated: Boolean(json.authenticated && json.user),
          user: json.user || null,
          error: ''
        });
      } catch {
        if (cancelled) return;
        setAuthState({
          loading: false,
          submitting: false,
          authenticated: false,
          user: null,
          error: ''
        });
      }
    }

    loadSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authState.loading) return;
    if (page === 'public-survey') return;
    if (!authState.authenticated) {
      if (path !== LOGIN_PATH && path !== SETUP_PASSWORD_PATH) navigate(LOGIN_PATH);
      return;
    }
    if (path === SETUP_PASSWORD_PATH) {
      return;
    }
    if (path !== canonicalPath) {
      navigate(canonicalPath);
    }
  }, [authState.authenticated, authState.loading, canonicalPath, navigate, path, page]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthState((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      const res = await apiFetch('/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || `Login failed (${res.status})`);
      }

      const nextRole = json.user?.frontend_role || 'admin';
      setAuthState({
        loading: false,
        submitting: false,
        authenticated: true,
        user: json.user,
        error: ''
      });
      setAuthForm({ email: '', password: '' });
      navigate(getDefaultPathForRole(nextRole));
    } catch (err) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        submitting: false,
        authenticated: false,
        user: null,
        error: err.message || 'Login failed.'
      }));
    }
  }

  async function handleLogout() {
    try {
      await apiFetch('/auth/logout/', { method: 'POST' });
    } catch (err) {
      // ignore logout transport failures and clear client state anyway
    }

    setAuthState({
      loading: false,
      submitting: false,
      authenticated: false,
      user: null,
      error: ''
    });
    navigate(LOGIN_PATH);
  }

  function handlePasswordSetupComplete(sessionUser) {
    const nextRole = sessionUser?.frontend_role || 'employee';
    setAuthState({
      loading: false,
      submitting: false,
      authenticated: true,
      user: sessionUser,
      error: ''
    });
    navigate(getDefaultPathForRole(nextRole));
  }

  function handleAuthInputChange(event) {
    const { name, value } = event.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSessionUserUpdate(nextUser) {
    setAuthState((prev) => ({
      ...prev,
      user: nextUser
    }));
  }

  if (page === 'public-survey') {
    return <PublicSurveyPage surveyToken={route.surveyToken} />;
  }

  if (authState.loading) {
    return (
      <LoginPage
        form={authForm}
        authState={authState}
        onChange={handleAuthInputChange}
        onSubmit={handleLogin}
      />
    );
  }

  if (path === SETUP_PASSWORD_PATH) {
    return <SetupPasswordPage onComplete={handlePasswordSetupComplete} />;
  }

  if (!authState.authenticated) {
    return (
      <LoginPage
        form={authForm}
        authState={authState}
        onChange={handleAuthInputChange}
        onSubmit={handleLogin}
      />
    );
  }

  const routeMap = ROUTES[role] || ROUTES.admin;
  const PageComponent = routeMap[page] || routeMap[config.defaultRoute];

  return (
    <Layout
      role={role}
      sessionUser={authState.user}
      navItems={config.nav}
      currentPath={canonicalPath}
      onLogout={handleLogout}
    >
      <PageComponent sessionUser={authState.user} onSessionUserUpdate={handleSessionUserUpdate} />
    </Layout>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
