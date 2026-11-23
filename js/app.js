/*
 * App shell: boots the data, renders the current route, wires one event
 * dispatcher for every button/form in the views, and keeps the
 * offline / first-run state honest.
 */

import { L, getLang, setLang } from './i18n.js';
import {
  data, ui, initState, saveSettings, upsert, profileName,
} from './state.js';
import { requestPersistentStorage } from './db.js';
import { currentMonthKey, todayISO, monthKeyOfISO } from './jalali.js';
import { escapeHtml as esc, debounce, formatDate } from './util.js';
import {
  icon, bindInputs, segmented, field, checkboxRow, note, toast,
} from './components.js';
import {
  actions, formHandlers, setRenderer, rerender, go,
} from './bus.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRecords } from './views/records.js';
import { renderPlan } from './views/plan.js';
import { renderCalc } from './views/calc.js';
import { renderReports } from './views/reports.js';
import { renderMore } from './views/more.js';
import { openTransactionSheet } from './views/entry.js';

const TABS = [
  { id: 'dashboard', route: '#/dashboard', icon: 'home', fa: 'خانه', en: 'Home' },
  { id: 'records', route: '#/records', icon: 'list', fa: 'تراکنش‌ها', en: 'Records' },
  { id: 'plan', route: '#/plan', icon: 'wallet', fa: 'برنامه', en: 'Planning' },
  { id: 'calc', route: '#/calc', icon: 'calculator', fa: 'محاسبه', en: 'Calculate' },
  { id: 'reports', route: '#/reports', icon: 'doc', fa: 'گزارش', en: 'Report' },
  { id: 'more', route: '#/more', icon: 'grid', fa: 'بیشتر', en: 'More' },
];

let lastHandledHash = '';
let lastNameRoleKey = '';

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');
  return { segments, params, head: segments[0] || 'dashboard' };
}

function render() {
  const route = parseRoute();
  const view = document.getElementById('view');
  if (!view) return;

  if (route.head === 'plan' && route.params.get('tab')) {
    ui.plan.tab = route.params.get('tab');
  }

  renderTopbar();
  renderTabbar(route);

  if (!data.settings.onboarded) {
    renderOnboarding();
    view.innerHTML = '';
    document.body.classList.add('is-onboarding');
    return;
  }
  document.body.classList.remove('is-onboarding');
  const onboardingRoot = document.getElementById('onboarding-root');
  if (onboardingRoot) {
    onboardingRoot.hidden = true;
    onboardingRoot.innerHTML = '';
  }

  const focus = captureFocus();
  let html = '';
  if (route.head === 'records') html = renderRecords();
  else if (route.head === 'plan') html = renderPlan();
  else if (route.head === 'calc') html = renderCalc();
  else if (route.head === 'reports') html = renderReports();
  else if (route.head === 'more') html = renderMore(route.segments[1] || '');
  else html = renderDashboard();

  view.innerHTML = html;
  bindInputs(view);
  restoreFocus(focus);
  maybeOpenFromRoute(route);
}

function renderTopbar() {
  const brand = document.getElementById('brand');
  if (brand) brand.textContent = L('مدیریت مالی خانواده', 'Family Finance');
  const today = document.getElementById('today-chip');
  if (today) today.textContent = formatDate(todayISO());
  updateNetStatus();
}

function renderTabbar(route) {
  const tabbar = document.getElementById('tabbar');
  if (!tabbar) return;
  const activeId = route.head === 'more' ? 'more' : route.head;
  tabbar.innerHTML = TABS.map(
    (tab) => `<a class="tab ${tab.id === activeId ? 'is-active' : ''}" href="${tab.route}"
      aria-current="${tab.id === activeId ? 'page' : 'false'}">
      ${icon(tab.icon, 22)}
      <span>${esc(getLang() === 'en' ? tab.en : tab.fa)}</span>
    </a>`,
  ).join('');
}

function updateNetStatus() {
  const pill = document.getElementById('net-pill');
  const offline = navigator.onLine === false;
  if (pill) {
    pill.textContent = offline ? L('آفلاین', 'Offline') : '';
    pill.hidden = !offline;
  }
  document.body.classList.toggle('is-offline', offline);
}

/* ---------------- focus keeping (search boxes re-render) ---------------- */

function captureFocus() {
  const active = document.activeElement;
  if (!active || !active.matches || !active.matches('[data-live-input]')) return null;
  return {
    key: active.dataset.liveInput,
    start: active.selectionStart,
    end: active.selectionEnd,
  };
}

function restoreFocus(state) {
  if (!state) return;
  const next = document.querySelector(`[data-live-input="${state.key}"]`);
  if (!next) return;
  next.focus({ preventScroll: true });
  try {
    next.setSelectionRange(state.start, state.end);
  } catch (err) {
    /* some input types refuse a range — fine */
  }
}

function maybeOpenFromRoute(route) {
  if (location.hash === lastHandledHash) return;
  if (route.head === 'records' && route.params.get('new')) {
    lastHandledHash = location.hash;
    const type = route.params.get('new') === 'income' ? 'income' : 'expense';
    setTimeout(() => openTransactionSheet({ type }), 60);
  }
}

/* ---------------- first run ---------------- */

function renderOnboarding() {
  const root = document.getElementById('onboarding-root');
  if (!root) return;
  root.hidden = false;
  root.innerHTML = `<div class="onboarding">
    <div class="onboarding__card">
      <div class="onboarding__logo">${icon('wallet', 34)}</div>
      <h1 class="onboarding__title">${esc(L('مدیریت مالی خانواده', 'Family finance'))}</h1>
      <p class="onboarding__text">${esc(L(
        'درآمد، هزینه، وام و پول قرضی خانواده را روی همین گوشی نگه دارید. همه مبلغ‌ها به تومان و همه تاریخ‌ها شمسی است.',
        'Keep your household income, spending, loans and lending on this phone. Every amount is in Toman and every date is Jalali.',
      ))}</p>
      <div class="onboarding__field">
        <span class="field__label">${esc(L('زبان', 'Language'))}</span>
        ${segmented('lang', [{ value: 'fa', label: 'فارسی' }, { value: 'en', label: 'English' }], getLang(), 'set-lang')}
      </div>
      <form id="onboard-form">
        ${field({
          label: L('نام شما', 'Your name'),
          input: `<input class="input" name="name" maxlength="40" autocomplete="off"
            placeholder="${esc(L('مثلاً مریم', 'e.g. Maryam'))}">`,
        })}
        ${checkboxRow({ name: 'demo', label: L('داده نمونه را نشانم بده', 'Show me sample data') })}
        <button type="submit" class="btn btn--primary btn--grow">${esc(L('شروع', 'Start'))}</button>
      </form>
      ${note(esc(L(
        'داده‌ها روی همین گوشی می‌مانند و به هیچ سروری فرستاده نمی‌شوند.',
        'Everything stays on this phone; nothing is sent to any server.',
      )))}
    </div>
  </div>`;
  bindInputs(root);
  const form = root.querySelector('#onboard-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim() || L('خودم', 'Me');
    const wantsDemo = form.elements.demo.checked;
    await upsert('profiles', { name, role: 'self' });
    await saveSettings({ onboarded: true, lastUsed: { ...data.settings.lastUsed, profileId: null } });
    ui.personFilter = 'all';
    ui.monthKey = currentMonthKey();
    if (wantsDemo) {
      const { seedDemo } = await import('./state.js');
      await seedDemo();
    }
    rerender();
    toast(L('خوش آمدید', 'Welcome'));
  });
}

/* ---------------- events ---------------- */

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const tag = element.tagName;
  /* Selects, checkboxes and file inputs report through the change event. */
  if (tag === 'SELECT' || tag === 'INPUT') return;
  const handler = actions.get(element.dataset.action);
  if (!handler) return;
  event.preventDefault();
  handler(element);
});

document.addEventListener('change', (event) => {
  if (!(event.target instanceof Element)) return;
  const element = event.target.closest('[data-action]');
  if (!element) return;
  if (!['SELECT', 'INPUT'].includes(element.tagName)) return;
  const handler = actions.get(element.dataset.action);
  if (!handler) return;
  handler(element);
});

const liveInput = debounce((element) => {
  const handler = actions.get(element.dataset.liveInput);
  if (handler) handler(element);
}, 220);

document.addEventListener('input', (event) => {
  const element = event.target.closest('[data-live-input]');
  if (!element) return;
  liveInput(element);
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  const handler = formHandlers.get(form.dataset.form);
  if (!handler) return;
  event.preventDefault();
  handler(form);
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0 });
});

window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', () => {
  updateNetStatus();
  toast(L('آفلاین شدید؛ برنامه کار می‌کند.', 'You are offline — the app still works.'), 'warn');
});

/* A write can fail (iOS aborts IndexedDB work while the app is in the
 * background). Never let that look like a successful save. */
window.addEventListener('unhandledrejection', (event) => {
  if (event && event.preventDefault) event.preventDefault();
  toast(
    L('این تغییر ذخیره نشد؛ دوباره امتحان کنید.', 'That change was not saved — please try again.'),
    'warn',
  );
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const stamp = todayISO();
  if (stamp !== lastNameRoleKey) {
    lastNameRoleKey = stamp;
    render();
  }
});

/* ---------------- boot ---------------- */

function showFatal(message) {
  const view = document.getElementById('view');
  if (view) {
    view.innerHTML = `<div class="view"><div class="card">${note(esc(message), 'warn')}</div></div>`;
  }
}

async function boot() {
  setRenderer(render);
  lastNameRoleKey = todayISO();
  try {
    setLang('fa');
    await initState();
    setLang(data.settings.lang || 'fa');
  } catch (err) {
    showFatal(L(
      'حافظه برنامه در دسترس نیست. اگر در حالت ناشناس (Private) هستید، آن را ببندید و دوباره باز کنید.',
      'The app storage is not available. If you are in Private Browsing, close it and open the app again.',
    ));
    return;
  }
  render();
  requestPersistentStorage();
  registerServiceWorker();
  setTouchIconFromCanvas();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* offline caching unavailable — the app still works while online */
  });
}

/* iOS ignores an SVG apple-touch-icon, so draw a PNG at runtime as a fallback. */
function setTouchIconFromCanvas() {
  try {
    const size = 180;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#0f8574');
    gradient.addColorStop(1, '#0b4f4a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const x = 34;
    const y = 62;
    const w = 112;
    const h = 74;
    const r = 16;
    ctx.strokeStyle = '#f0fdfa';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x + w, y + 22);
    ctx.stroke();
    ctx.fillStyle = '#f0fdfa';
    ctx.beginPath();
    ctx.arc(x + w - 24, y + 48, 8, 0, Math.PI * 2);
    ctx.fill();

    const dataUrl = canvas.toDataURL('image/png');
    let link = document.querySelector('link[rel="apple-touch-icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  } catch (err) {
    /* keep the SVG icon the page already declares */
  }
}

boot();
