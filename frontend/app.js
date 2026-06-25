// ---------------------------------------------------------------------------
// Config — local docker-compose ports. Once deployed behind the ALB, all
// three services share one origin and this collapses to ''.
// ---------------------------------------------------------------------------
const CONFIG = {
  AUTH_BASE: 'http://localhost:3001',
  ORDERS_BASE: 'http://localhost:3003',
  NOTIFICATIONS_BASE: 'http://localhost:3002',
};

const SESSION_KEYS = { token: 'mesh_token', username: 'mesh_username' };

function getToken() {
  return localStorage.getItem(SESSION_KEYS.token);
}

function getUsername() {
  return localStorage.getItem(SESSION_KEYS.username);
}

function setSession(token, username) {
  localStorage.setItem(SESSION_KEYS.token, token);
  localStorage.setItem(SESSION_KEYS.username, username);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEYS.token);
  localStorage.removeItem(SESSION_KEYS.username);
}

function requireAuth() {
  if (!getToken()) {
    window.location.replace('index.html');
    return false;
  }
  return true;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

function authHeader() {
  return { Authorization: `Bearer ${getToken()}` };
}

// Wraps fetch; on 401 clears the session and bounces to login.
async function authFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeader() },
  });
  if (resp.status === 401) {
    clearSession();
    window.location.replace('index.html');
    throw new Error('session expired');
  }
  return resp;
}

const WORDMARK_SVG = `
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="4" cy="4" r="2.4" fill="var(--accent)"/>
    <circle cx="14" cy="4" r="2.4" fill="var(--accent)"/>
    <circle cx="9" cy="14" r="2.4" fill="var(--accent)"/>
    <path d="M5.8 5.4L8 12.2M12.2 5.4L10 12.2M6.4 4H11.6" stroke="var(--accent)" stroke-width="1.1" opacity="0.55"/>
  </svg>`;

function renderTopbar({ activeNav, authed }) {
  const el = document.getElementById('topbar');
  if (!el) return;

  const nav = authed
    ? `<nav class="topbar-nav">
         <a href="orders.html" class="${activeNav === 'orders' ? 'active' : ''}">Orders</a>
         <a href="notifications.html" class="${activeNav === 'notifications' ? 'active' : ''}">Notifications</a>
       </nav>`
    : '';

  const user = authed
    ? `<div class="topbar-user">
         <span class="username">${getUsername() || ''}</span>
         <button class="btn btn-ghost" onclick="logout()">Sign out</button>
       </div>`
    : '';

  el.innerHTML = `
    <div class="wordmark">${WORDMARK_SVG}mesh</div>
    <div class="health-strip" id="healthStrip">
      ${['auth', 'orders', 'notifications']
        .map((s) => `<span class="health-item"><span class="health-dot" id="dot-${s}"></span>${s}</span>`)
        .join('')}
    </div>
    ${nav}
    ${user}
  `;

  pollHealth();
  setInterval(pollHealth, 5000);
}

async function pingHealth(base, dotId) {
  const dot = document.getElementById(dotId);
  if (!dot) return;
  try {
    const resp = await fetch(`${base}/health`, { cache: 'no-store' });
    dot.classList.toggle('up', resp.ok);
    dot.classList.toggle('down', !resp.ok);
  } catch (err) {
    dot.classList.remove('up');
    dot.classList.add('down');
  }
}

function pollHealth() {
  pingHealth(CONFIG.AUTH_BASE, 'dot-auth');
  pingHealth(CONFIG.ORDERS_BASE, 'dot-orders');
  pingHealth(CONFIG.NOTIFICATIONS_BASE, 'dot-notifications');
}

function timeAgo(isoString) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
