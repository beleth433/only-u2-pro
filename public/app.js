// Global Database Key for Client-Side Persistence across Vercel serverless restarts
const DB_STORAGE_KEY = 'only_u2_pro_crm_storage_v3';

// Default templates fallback
const DEFAULT_TEMPLATES = {
  bikeModels: ["Only U2 Pro", "Minako Monster V8", "Minako Monster Max", "Jetson V8 Pro", "Kugoo Kirin V1 Pro"],
  batteryTypes: ["60V 21Ah", "60V 30Ah Увеличенная", "48V 18Ah", "60V 24Ah"]
};

// Global State
let state = {
  bikes: [],
  batteries: [],
  couriers: [],
  history: [],
  templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
  settings: {
    appName: "Only U2 Pro",
    companyName: "Only U2 Pro Fleet",
    currency: "₽",
    defaultDeposit: 5000,
    rates: { day: 700, week: 3500, month: 12000 }
  },
  currentTab: 'dashboard',
  fleetFilter: 'all',
  batFilter: 'all',
  currentUser: {
    name: 'Владелец Only U2 Pro',
    role: 'owner',
    authorized: true
  }
};

let currentTemplateTab = 'bikes';
let pendingDeleteCallback = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupDate();
  initDatabase();
  setupEventListeners();

  // Setup in-app confirmation modal button
  const confirmBtn = document.getElementById('confirmDeleteSubmitBtn');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (typeof pendingDeleteCallback === 'function') {
        pendingDeleteCallback();
      }
      closeConfirmDelete();
    };
  }

  // Handle URL hash changes (back/forward or tab links)
  window.addEventListener('hashchange', () => {
    const tab = window.location.hash.replace('#', '');
    if (['dashboard', 'fleet', 'batteries', 'couriers', 'history'].includes(tab)) {
      switchTab(tab, false);
    }
  });
});

function setupDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date().toLocaleDateString('ru-RU', options);
  const el = document.getElementById('currentDateString');
  if (el) el.innerText = today.charAt(0).toUpperCase() + today.slice(1);
}

// -------------------------------------------------------------
// LOCALSTORAGE DATABASE PERSISTENCE (100% ВЫЖИВАЕМОСТЬ НА VERCEL)
// -------------------------------------------------------------
function saveLocalDatabase() {
  try {
    const payload = {
      bikes: state.bikes,
      batteries: state.batteries,
      couriers: state.couriers,
      history: state.history,
      templates: state.templates,
      settings: state.settings,
      savedAt: Date.now()
    };
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

function loadLocalDatabase() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function initDatabase() {
  const saved = loadLocalDatabase();

  // If user already has stored database in their browser, use it authoritatively!
  if (saved && Array.isArray(saved.bikes)) {
    state.bikes = saved.bikes || [];
    state.batteries = saved.batteries || [];
    state.couriers = saved.couriers || [];
    state.history = saved.history || [];
    state.templates = (saved.templates && saved.templates.bikeModels) ? saved.templates : DEFAULT_TEMPLATES;
    if (saved.settings) state.settings = saved.settings;

    applyInitialTab();
    populateTemplateSelects();
    updateBadges();
    renderCurrentTab();
    return;
  }

  // First visit: fetch initial seed from backend
  try {
    const res = await fetch('/api/all-data').catch(() => null);
    if (res && res.ok) {
      const serverData = await res.json();
      state.bikes = serverData.bikes || [];
      state.batteries = serverData.batteries || [];
      state.couriers = serverData.couriers || [];
      state.history = serverData.history || [];
      if (serverData.settings && serverData.settings.templates) {
        state.templates = serverData.settings.templates;
      }
      if (serverData.settings) state.settings = serverData.settings;
    } else {
      // Direct fallback to seed.json if running statically
      const seedRes = await fetch('/seed.json').catch(() => null);
      if (seedRes && seedRes.ok) {
        const seedData = await seedRes.json();
        state.bikes = seedData.bikes || [];
        state.batteries = seedData.batteries || [];
        state.couriers = seedData.couriers || [];
        state.history = seedData.history || [];
        if (seedData.settings && seedData.settings.templates) {
          state.templates = seedData.settings.templates;
        }
      }
    }
  } catch (err) {
    console.warn('Initial server fetch failed, using defaults:', err);
  }

  saveLocalDatabase();
  applyInitialTab();
  populateTemplateSelects();
  updateBadges();
  renderCurrentTab();
}

// Ensure user stays on the active tab on page refresh
function applyInitialTab() {
  const hash = window.location.hash.replace('#', '');
  if (['dashboard', 'fleet', 'batteries', 'couriers', 'history'].includes(hash)) {
    switchTab(hash, false);
  } else {
    switchTab('dashboard', false);
  }
}

// -------------------------------------------------------------
// NAVIGATION & TABS
// -------------------------------------------------------------
function switchTab(tabId, updateHash = true) {
  state.currentTab = tabId;

  if (updateHash) {
    window.location.hash = '#' + tabId;
  }

  // Desktop nav links
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.remove('active', 'bg-brand-50', 'text-brand-700', 'font-semibold');
    el.classList.add('text-slate-600');
  });
  const activeDesktopNav = document.getElementById(`nav-${tabId}`);
  if (activeDesktopNav) {
    activeDesktopNav.classList.add('active', 'bg-brand-50', 'text-brand-700', 'font-semibold');
    activeDesktopNav.classList.remove('text-slate-600');
  }

  // Mobile nav buttons
  document.querySelectorAll('.mobile-nav-btn').forEach(el => {
    el.classList.remove('text-brand-600');
    el.classList.add('text-slate-400');
  });
  const activeMobileNav = document.getElementById(`m-nav-${tabId}`);
  if (activeMobileNav) {
    activeMobileNav.classList.add('text-brand-600');
    activeMobileNav.classList.remove('text-slate-400');
  }

  // Tab content visibility
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  renderCurrentTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateBadges() {
  // 1. Fleet: Free/available (emerald), In rent (blue), In service (amber)
  const fleetContainer = document.getElementById('badgesFleetContainer');
  if (fleetContainer) {
    const availBikes = state.bikes.filter(b => b.status === 'available').length;
    const inRentBikes = state.bikes.filter(b => b.status === 'in_rent').length;
    const serviceBikes = state.bikes.filter(b => b.status === 'service').length;

    let html = '';
    if (availBikes > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80" title="Свободно на складе: ${availBikes}">${availBikes}</span>`;
    }
    if (inRentBikes > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200/80" title="В аренде: ${inRentBikes}">${inRentBikes}</span>`;
    }
    if (serviceBikes > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200/80" title="В ремонте: ${serviceBikes}">${serviceBikes}</span>`;
    }
    fleetContainer.innerHTML = html;
  }

  // 2. Batteries: Free/available on stock (emerald), In use/rent (blue)
  const batContainer = document.getElementById('badgesBatteriesContainer');
  if (batContainer) {
    const availBats = state.batteries.filter(b => b.status === 'available').length;
    const inUseBats = state.batteries.filter(b => b.status === 'in_use').length;

    let html = '';
    if (availBats > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80" title="Свободно на складе: ${availBats}">${availBats}</span>`;
    }
    if (inUseBats > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200/80" title="В аренде (выдано): ${inUseBats}">${inUseBats}</span>`;
    }
    batContainer.innerHTML = html;
  }

  // 3. Couriers: Total (slate), Debtors/Overdue (rose, only if > 0)
  const courierContainer = document.getElementById('badgesCouriersContainer');
  if (courierContainer) {
    const totalCouriers = state.couriers.length;
    const debtorsCount = state.couriers.filter(c => (c.debt || 0) > 0).length;

    let html = '';
    if (totalCouriers > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700" title="Всего курьеров: ${totalCouriers}">${totalCouriers}</span>`;
    }
    if (debtorsCount > 0) {
      html += `<span class="text-xs px-1.5 py-0.5 rounded-md font-bold bg-rose-50 text-rose-700 border border-rose-200/80" title="Просрочили аренду: ${debtorsCount}">${debtorsCount}</span>`;
    }
    courierContainer.innerHTML = html;
  }
}

function renderCurrentTab() {
  switch (state.currentTab) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'fleet':
      renderFleet();
      break;
    case 'batteries':
      renderBatteries();
      break;
    case 'couriers':
      renderCouriers();
      break;
    case 'history':
      renderHistory();
      break;
  }
}

// -------------------------------------------------------------
// TEMPLATE MANAGEMENT MODAL (ДОБАВЛЕНИЕ И УДАЛЕНИЕ ШАБЛОНОВ)
// -------------------------------------------------------------
function openTemplateManager(tab = 'bikes') {
  currentTemplateTab = tab;
  switchTemplateManagerTab(tab);
  openModal('templateManagerModal');
}

function switchTemplateManagerTab(tab) {
  currentTemplateTab = tab;
  const bikesBtn = document.getElementById('tmplTabBikesBtn');
  const batsBtn = document.getElementById('tmplTabBatsBtn');
  const input = document.getElementById('tmplInput');
  const title = document.getElementById('tmplListTitle');

  if (tab === 'bikes') {
    if (bikesBtn) bikesBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-white text-slate-900 shadow-xs transition-all';
    if (batsBtn) batsBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-900 transition-all';
    if (input) input.placeholder = 'Название модели (например: Minako F10, Only U2 Pro V2)...';
    if (title) title.innerText = 'Текущие модели велосипедов:';
  } else {
    if (batsBtn) batsBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-white text-slate-900 shadow-xs transition-all';
    if (bikesBtn) bikesBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-900 transition-all';
    if (input) input.placeholder = 'Характеристика АКБ (например: 60V 35Ah, 48V 25Ah)...';
    if (title) title.innerText = 'Текущие типы и емкости АКБ:';
  }

  if (input) input.value = '';
  renderTemplateManagerList();
}

function renderTemplateManagerList() {
  const container = document.getElementById('tmplListContainer');
  if (!container) return;

  const items = currentTemplateTab === 'bikes' 
    ? (state.templates.bikeModels || []) 
    : (state.templates.batteryTypes || []);

  if (items.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Список пуст. Добавьте первый шаблон выше.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/80 transition-all">
      <span class="font-semibold text-slate-800 text-xs">${item}</span>
      <button type="button" onclick="deleteTemplateFromManager('${encodeURIComponent(item)}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Удалить этот шаблон">
        <i class="ph-bold ph-trash text-sm"></i>
      </button>
    </div>
  `).join('');
}

async function handleAddTemplateFromManager() {
  const input = document.getElementById('tmplInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast('Введите название для шаблона', 'error');
    return;
  }

  if (currentTemplateTab === 'bikes') {
    if (!state.templates.bikeModels.includes(val)) {
      state.templates.bikeModels.push(val);
    }
  } else {
    if (!state.templates.batteryTypes.includes(val)) {
      state.templates.batteryTypes.push(val);
    }
  }

  saveLocalDatabase();
  populateTemplateSelects();
  renderTemplateManagerList();
  input.value = '';
  showToast(`Шаблон «${val}» добавлен!`, 'success');

  // Background server sync
  const endpoint = currentTemplateTab === 'bikes' ? '/api/templates/bike-models' : '/api/templates/battery-types';
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: val })
  }).catch(() => {});
}

async function deleteTemplateFromManager(encodedName) {
  const name = decodeURIComponent(encodedName);

  if (currentTemplateTab === 'bikes') {
    state.templates.bikeModels = state.templates.bikeModels.filter(m => m !== name);
  } else {
    state.templates.batteryTypes = state.templates.batteryTypes.filter(t => t !== name);
  }

  saveLocalDatabase();
  populateTemplateSelects();
  renderTemplateManagerList();
  showToast(`Шаблон «${name}» удален!`, 'info');

  // Background server sync
  const endpoint = currentTemplateTab === 'bikes'
    ? `/api/templates/bike-models/${encodedName}`
    : `/api/templates/battery-types/${encodedName}`;
  fetch(endpoint, { method: 'DELETE' }).catch(() => {});
}

function populateTemplateSelects() {
  // 1. Bike Models
  const newBikeModelSelect = document.getElementById('newBikeModelSelect');
  const editBikeModelSelect = document.getElementById('editBikeModelSelect');
  const bikeModels = (state.templates && state.templates.bikeModels && state.templates.bikeModels.length > 0) 
    ? state.templates.bikeModels 
    : DEFAULT_TEMPLATES.bikeModels;

  const modelOptions = bikeModels.map(m => `<option value="${m}">${m}</option>`).join('');
  if (newBikeModelSelect) {
    const currVal = newBikeModelSelect.value;
    newBikeModelSelect.innerHTML = modelOptions;
    if (currVal && bikeModels.includes(currVal)) newBikeModelSelect.value = currVal;
  }
  if (editBikeModelSelect) {
    const currVal = editBikeModelSelect.value;
    editBikeModelSelect.innerHTML = modelOptions;
    if (currVal && bikeModels.includes(currVal)) editBikeModelSelect.value = currVal;
  }

  // 2. Battery Types
  const newBatTypeSelect = document.getElementById('newBatTypeSelect');
  const editBatTypeSelect = document.getElementById('editBatTypeSelect');
  const batteryTypes = (state.templates && state.templates.batteryTypes && state.templates.batteryTypes.length > 0)
    ? state.templates.batteryTypes
    : DEFAULT_TEMPLATES.batteryTypes;

  const batOptions = batteryTypes.map(t => `<option value="${t}">${t}</option>`).join('');
  if (newBatTypeSelect) {
    const currVal = newBatTypeSelect.value;
    newBatTypeSelect.innerHTML = batOptions;
    if (currVal && batteryTypes.includes(currVal)) newBatTypeSelect.value = currVal;
  }
  if (editBatTypeSelect) {
    const currVal = editBatTypeSelect.value;
    editBatTypeSelect.innerHTML = batOptions;
    if (currVal && batteryTypes.includes(currVal)) editBatTypeSelect.value = currVal;
  }

  // 3. Populate Available Batteries into Add Bike Modal
  const newBikeBatterySelect = document.getElementById('newBikeBatterySelect');
  if (newBikeBatterySelect) {
    const freeBats = state.batteries.filter(b => b.status === 'available');
    let opts = `<option value="">Без аккумулятора (установить позже)</option>`;
    opts += freeBats.map(b => `<option value="${b.id}">#${b.id} (${b.type})</option>`).join('');
    newBikeBatterySelect.innerHTML = opts;
  }
}

// -------------------------------------------------------------
// CONFIRM DELETE POPUP (НАДЕЖНО БЕЗ window.confirm)
// -------------------------------------------------------------
function openConfirmDelete(title, message, onConfirm) {
  const titleEl = document.getElementById('confirmDeleteTitle');
  const msgEl = document.getElementById('confirmDeleteMessage');
  const modal = document.getElementById('confirmDeleteModal');

  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = message;
  pendingDeleteCallback = onConfirm;

  if (modal) modal.classList.remove('hidden');
}

function closeConfirmDelete() {
  pendingDeleteCallback = null;
  const modal = document.getElementById('confirmDeleteModal');
  if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------
// 1. DASHBOARD RENDER
// -------------------------------------------------------------
function renderDashboard() {
  const inRentCount = state.bikes.filter(b => b.status === 'in_rent').length;
  const availableBikesCount = state.bikes.filter(b => b.status === 'available').length;
  const readyBatsCount = state.batteries.filter(b => b.status === 'available').length;
  const inUseBatsCount = state.batteries.filter(b => b.status === 'in_use').length;
  const debtors = state.couriers.filter(c => c.debt > 0);
  const totalDebt = debtors.reduce((acc, c) => acc + (c.debt || 0), 0);

  // KPI counters
  const kpiInRentEl = document.getElementById('kpiInRent');
  if (kpiInRentEl) kpiInRentEl.innerText = inRentCount;

  const inRentPct = Math.round((inRentCount / (state.bikes.length || 1)) * 100);
  const kpiInRentPctEl = document.getElementById('kpiInRentPct');
  if (kpiInRentPctEl) kpiInRentPctEl.innerText = `${inRentPct}%`;

  const kpiAvailEl = document.getElementById('kpiAvailable');
  if (kpiAvailEl) kpiAvailEl.innerText = availableBikesCount;

  const kpiReadyBatEl = document.getElementById('kpiReadyBatteries');
  if (kpiReadyBatEl) kpiReadyBatEl.innerText = readyBatsCount;

  const kpiInUseBatEl = document.getElementById('kpiInUseBatteries');
  if (kpiInUseBatEl) kpiInUseBatEl.innerText = inUseBatsCount;

  const kpiTotalDebtEl = document.getElementById('kpiTotalDebt');
  if (kpiTotalDebtEl) kpiTotalDebtEl.innerText = `${totalDebt.toLocaleString()} ₽`;

  const kpiDebtorsCountEl = document.getElementById('kpiDebtorsCount');
  if (kpiDebtorsCountEl) kpiDebtorsCountEl.innerText = `${debtors.length} должн.`;

  const kpiWeeklyRevEl = document.getElementById('kpiWeeklyRevenue');
  if (kpiWeeklyRevEl) kpiWeeklyRevEl.innerText = `${(inRentCount * 3500).toLocaleString()} ₽`;

  // Dynamic Attention Alert for Real Debtors
  const alertContainer = document.getElementById('dashboardAlertContainer');
  if (alertContainer) {
    if (debtors.length > 0) {
      alertContainer.classList.remove('hidden');
      alertContainer.innerHTML = debtors.map(c => `
        <div class="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div class="flex items-start space-x-3.5">
            <div class="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              <i class="ph-bold ph-warning-circle"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white uppercase tracking-wider">Просрочка аренды</span>
                <span class="text-xs font-mono font-bold text-rose-800">Долг: ${c.debt.toLocaleString()} ₽</span>
              </div>
              <h4 class="font-bold text-slate-900 text-sm mt-1">${c.fullName}</h4>
              <p class="text-xs text-slate-500 mt-0.5">Телефон: <a href="tel:${c.phone}" class="text-rose-700 font-semibold underline">${c.phone}</a> • Байк: #${c.activeBikeId || 'Не закреплен'}</p>
            </div>
          </div>
          <div class="flex items-center space-x-2 sm:self-center">
            <button onclick="preparePaymentForCourier('${c.id}')" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center space-x-1.5">
              <i class="ph-bold ph-money"></i>
              <span>Принять оплату</span>
            </button>
          </div>
        </div>
      `).join('');
    } else {
      alertContainer.classList.add('hidden');
      alertContainer.innerHTML = '';
    }
  }

  // Render Active Rentals Table
  const tableBody = document.getElementById('activeRentalsTableBody');
  if (!tableBody) return;

  const activeRentals = state.bikes.filter(b => b.status === 'in_rent');
  if (activeRentals.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">В данный момент нет активных аренд</td></tr>`;
  } else {
    tableBody.innerHTML = activeRentals.map(bike => {
      const courier = state.couriers.find(c => c.id === bike.currentCourierId) || { fullName: 'Курьер', phone: '—', debt: 0 };
      const battery = state.batteries.find(b => b.id === bike.batteryId);
      const isDebtor = courier.debt > 0;

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="px-4 py-3.5">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs flex-shrink-0">
                ${courier.fullName.charAt(0)}
              </div>
              <div>
                <div class="font-bold text-slate-900">${courier.fullName}</div>
                <div class="text-[11px] text-slate-400 flex items-center space-x-1">
                  <span>${courier.phone}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3.5">
            <div class="font-medium text-slate-800">${bike.model} <span class="font-mono text-xs font-semibold text-slate-500">#${bike.id}</span></div>
            <div class="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
              <i class="ph-bold ph-battery-high text-brand-600"></i>
              <span>АКБ: <strong>#${bike.batteryId || '—'}</strong> (${battery ? battery.type : '—'})</span>
            </div>
          </td>
          <td class="px-4 py-3.5">
            <div class="font-medium text-slate-700">до ${bike.rentalEnd || 'Не указан'}</div>
            <div class="text-[10px] text-slate-400">с ${bike.rentalStart || '—'}</div>
          </td>
          <td class="px-4 py-3.5">
            ${isDebtor 
              ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Долг ${courier.debt.toLocaleString()} ₽</span>` 
              : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Оплачено</span>`}
          </td>
          <td class="px-4 py-3.5 text-right">
            <button onclick="prepareCheckin('${bike.id}')" class="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 rounded-lg text-xs transition-all" title="Принять байк на склад">
              Принять
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render Available Batteries Mini-List
  const batStockEl = document.getElementById('availableBatteriesMiniList');
  if (batStockEl) {
    const freeBats = state.batteries.filter(b => b.status === 'available');
    if (freeBats.length === 0) {
      batStockEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Все аккумуляторы выданы курьерам</div>`;
    } else {
      batStockEl.innerHTML = freeBats.slice(0, 5).map(b => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          <div class="flex items-center space-x-2.5">
            <div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              <i class="ph-bold ph-battery-high"></i>
            </div>
            <div>
              <div class="font-bold font-mono text-slate-800">#${b.id}</div>
              <div class="text-slate-400 text-[10px]">${b.type}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Свободен
          </span>
        </div>
      `).join('');
    }
  }
}

// -------------------------------------------------------------
// 2. FLEET (ВЕЛОПАРК) RENDER
// -------------------------------------------------------------
function filterFleet(filter) {
  state.fleetFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(el => {
    el.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
    el.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-200');
  });

  const activePill = document.getElementById(`fleet-filter-${filter}`);
  if (activePill) {
    activePill.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
    activePill.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-200');
  }

  renderFleet();
}

function renderFleet() {
  const container = document.getElementById('fleetGridContainer');
  if (!container) return;

  let filtered = state.bikes;
  if (state.fleetFilter !== 'all') {
    filtered = state.bikes.filter(b => b.status === state.fleetFilter);
  }

  // Update counts
  const countAll = document.getElementById('countAllBikes');
  if (countAll) countAll.innerText = state.bikes.length;
  const countRent = document.getElementById('countInRent');
  if (countRent) countRent.innerText = state.bikes.filter(b => b.status === 'in_rent').length;
  const countAvail = document.getElementById('countAvailable');
  if (countAvail) countAvail.innerText = state.bikes.filter(b => b.status === 'available').length;
  const countServ = document.getElementById('countService');
  if (countServ) countServ.innerText = state.bikes.filter(b => b.status === 'service').length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">В этой категории нет велосипедов</div>`;
    return;
  }

  container.innerHTML = filtered.map(bike => {
    const courier = state.couriers.find(c => c.id === bike.currentCourierId);
    const battery = state.batteries.find(b => b.id === bike.batteryId);

    let statusBadge = '';
    if (bike.status === 'in_rent') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">В аренде</span>`;
    } else if (bike.status === 'available') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Свободен</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">На ремонте/ТО</span>`;
    }

    return `
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-sm card-hover flex flex-col justify-between">
        <div>
          <!-- Header -->
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-2">
              <span class="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">#${bike.id}</span>
            </div>
            <div class="flex items-center space-x-1.5">
              ${statusBadge}
              <button onclick="openEditBike('${bike.id}')" class="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all" title="Редактировать параметры байка">
                <i class="ph-bold ph-pencil-simple text-sm"></i>
              </button>
              <button onclick="deleteBike('${bike.id}')" class="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Удалить байк из парка">
                <i class="ph-bold ph-trash text-sm"></i>
              </button>
            </div>
          </div>

          <!-- Model & Specs -->
          <h3 class="font-bold text-slate-900 text-base mt-2.5">${bike.model}</h3>
          <div class="text-xs text-slate-500 mt-0.5 flex items-center justify-between">
            <span>VIN/Рама: <strong class="font-mono text-slate-700">${bike.frameNumber}</strong></span>
            <span>Пробег: <strong class="text-slate-700">${bike.mileageKm || 0} км</strong></span>
          </div>

          <!-- Attached Battery Box -->
          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-slate-500 text-[11px]">Выданная АКБ:</span>
              <span class="font-bold font-mono text-slate-800">
                ${battery ? `#${battery.id} (${battery.type})` : '<span class="text-slate-400 font-normal">Не установлена</span>'}
              </span>
            </div>
          </div>

          <!-- Condition note -->
          <div class="mt-2 text-[11px] text-slate-500">
            Состояние: <span class="italic text-slate-600">${bike.condition || 'В норме'}</span>
          </div>

          <!-- Courier / Location -->
          <div class="mt-3 text-xs">
            ${bike.status === 'in_rent' && courier ? `
              <div class="flex items-center space-x-2 p-2 rounded-xl bg-blue-50/50 border border-blue-100">
                <i class="ph-bold ph-user text-blue-700 text-sm"></i>
                <div class="overflow-hidden">
                  <div class="font-bold text-slate-900 truncate">${courier.fullName}</div>
                  <div class="text-[10px] text-slate-500">до ${bike.rentalEnd || '—'} • ${courier.phone}</div>
                </div>
              </div>
            ` : `
              <div class="text-[11px] text-slate-400 flex items-center space-x-1.5">
                <i class="ph-bold ph-map-pin text-slate-400"></i>
                <span>${bike.location || 'Склад'}</span>
              </div>
            `}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-2">
          ${bike.status === 'available' ? `
            <button onclick="prepareCheckoutForBike('${bike.id}')" class="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all text-center">
              Выдать курьеру
            </button>
            <button onclick="sendToService('${bike.id}')" class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs" title="Отправить на ТО">
              <i class="ph-bold ph-wrench text-sm"></i>
            </button>
          ` : (bike.status === 'in_rent' ? `
            <button onclick="prepareCheckin('${bike.id}')" class="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-all">
              Принять возврат
            </button>
          ` : `
            <button onclick="markReadyFromService('${bike.id}')" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all">
              Вернуть с ТО на склад
            </button>
          `)}
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 3. BATTERIES (АКБ) RENDER
// -------------------------------------------------------------
function filterBatteries(filter) {
  state.batFilter = filter;
  document.querySelectorAll('.bat-filter-pill').forEach(el => {
    el.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
    el.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-200');
  });

  const activePill = document.getElementById(`bat-filter-${filter}`);
  if (activePill) {
    activePill.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
    activePill.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-200');
  }

  renderBatteries();
}

function renderBatteries() {
  const container = document.getElementById('batteriesGridContainer');
  if (!container) return;

  let filtered = state.batteries;
  if (state.batFilter === 'available') {
    filtered = state.batteries.filter(b => b.status === 'available');
  } else if (state.batFilter === 'in_use') {
    filtered = state.batteries.filter(b => b.status === 'in_use');
  }

  const bAll = document.getElementById('batCountAll');
  if (bAll) bAll.innerText = state.batteries.length;
  const bAvail = document.getElementById('batCountAvailable');
  if (bAvail) bAvail.innerText = state.batteries.filter(b => b.status === 'available').length;
  const bUse = document.getElementById('batCountInUse');
  if (bUse) bUse.innerText = state.batteries.filter(b => b.status === 'in_use').length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">Нет аккумуляторов в этом статусе</div>`;
    return;
  }

  container.innerHTML = filtered.map(bat => {
    const isAvailable = bat.status === 'available';

    return `
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm card-hover flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-sm text-slate-800">#${bat.id}</span>
            <div class="flex items-center space-x-1.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${isAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}">
                ${isAvailable ? 'Свободен (на складе)' : `На байке #${bat.assignedBike || '—'}`}
              </span>
              <button onclick="openEditBattery('${bat.id}')" class="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all" title="Редактировать АКБ">
                <i class="ph-bold ph-pencil-simple text-sm"></i>
              </button>
              <button onclick="deleteBattery('${bat.id}')" class="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Удалить АКБ">
                <i class="ph-bold ph-trash text-sm"></i>
              </button>
            </div>
          </div>

          <div class="mt-3">
            <div class="text-base font-bold text-slate-900">${bat.type}</div>
            <div class="text-xs text-slate-500 mt-0.5">${bat.model || `Li-ion ${bat.type}`}</div>
          </div>

          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
            <span class="text-slate-400 text-[11px] block">Примечание / Состояние:</span>
            <span>${bat.notes || 'В наличии'}</span>
          </div>
        </div>

        <div class="mt-4 pt-2">
          ${isAvailable ? `
            <button onclick="openModal('checkoutModal')" class="w-full py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl text-xs border border-brand-200 transition-all">
              Выдать с велосипедом
            </button>
          ` : `
            <div class="text-[11px] text-center text-slate-400 py-1 font-medium">Закреплен за курьером</div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 4. COURIERS (КУРЬЕРЫ) RENDER
// -------------------------------------------------------------
function renderCouriers() {
  const container = document.getElementById('couriersGridContainer');
  if (!container) return;

  if (!state.couriers || state.couriers.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">В базе нет курьеров. Нажмите «Добавить курьера» чтобы зарегистрировать первого.</div>`;
    return;
  }

  container.innerHTML = state.couriers.map(c => {
    const isDebtor = c.debt > 0;
    const hasBike = Boolean(c.activeBikeId);
    const bike = hasBike ? state.bikes.find(b => b.id === c.activeBikeId) : null;
    
    // Clean integer rating from 1 to 5 (strictly no decimals)
    const ratingInt = Math.min(5, Math.max(1, Math.round(Number(c.rating) || 5)));

    return `
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-sm card-hover flex flex-col justify-between">
        <div>
          <!-- Header -->
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm flex-shrink-0">
                ${c.fullName.charAt(0)}
              </div>
              <div>
                <h3 class="font-bold text-slate-900 text-sm leading-snug">${c.fullName}</h3>
                <span class="text-[11px] text-slate-400 font-mono">#${c.id}</span>
              </div>
            </div>

            <!-- Rating, Edit & Delete -->
            <div class="flex items-center space-x-1.5">
              <div class="flex items-center space-x-1 text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200" title="Рейтинг надежности">
                <i class="ph-fill ph-star"></i>
                <span>${ratingInt}</span>
              </div>
              <button onclick="openEditCourier('${c.id}')" class="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all" title="Редактировать профиль курьера">
                <i class="ph-bold ph-pencil-simple text-sm"></i>
              </button>
              <button onclick="deleteCourier('${c.id}')" class="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Удалить курьера">
                <i class="ph-bold ph-trash text-sm"></i>
              </button>
            </div>
          </div>

          <!-- Contact & Passport -->
          <div class="mt-3 space-y-1 text-xs text-slate-600">
            <div class="flex items-center space-x-1.5">
              <i class="ph ph-phone text-slate-400"></i>
              <a href="tel:${c.phone}" class="hover:text-brand-600 font-semibold">${c.phone}</a>
            </div>
            <div class="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <i class="ph ph-identification-card text-slate-400"></i>
              <span>Паспорт/РВП: ${c.passportNumber || 'Не указан'}</span>
            </div>
            ${c.notes ? `
              <div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span class="text-slate-400 font-semibold">Заметка:</span> ${c.notes}
              </div>
            ` : ''}
          </div>

          <!-- Financial Status -->
          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-500">Внесенный залог:</span>
              <span class="font-bold text-slate-800">${(c.deposit || 0).toLocaleString()} ₽</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Баланс / Долг:</span>
              ${isDebtor ? `
                <span class="font-bold text-rose-600">Долг ${c.debt.toLocaleString()} ₽</span>
              ` : `
                <span class="font-bold text-emerald-600">Оплачено (без долгов)</span>
              `}
            </div>
          </div>

          <!-- Assigned Bike -->
          <div class="mt-3 text-xs">
            ${hasBike && bike ? `
              <div class="p-2 rounded-xl bg-brand-50/60 border border-brand-100 text-brand-900 flex items-center justify-between">
                <div>
                  <div class="font-bold">Байк: #${bike.id} (${bike.model})</div>
                  <div class="text-[10px] text-brand-700">АКБ #${bike.batteryId || '—'}</div>
                </div>
                <button onclick="prepareCheckin('${bike.id}')" class="px-2 py-1 bg-white hover:bg-brand-100 text-brand-800 font-semibold rounded text-[11px] border border-brand-200">
                  Принять
                </button>
              </div>
            ` : `
              <div class="p-2 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-center text-[11px]">
                Байк не арендован
              </div>
            `}
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-2">
          <button onclick="preparePaymentForCourier('${c.id}')" class="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all">
            Принять оплату
          </button>
          ${!hasBike ? `
            <button onclick="prepareCheckoutForCourier('${c.id}')" class="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all">
              Выдать байк
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 5. HISTORY RENDER
// -------------------------------------------------------------
function renderHistory() {
  const container = document.getElementById('historyListContainer');
  if (!container) return;

  if (!state.history || state.history.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">История пуста</div>`;
    return;
  }

  container.innerHTML = state.history.map(item => {
    let icon = 'ph-bold ph-info text-blue-600 bg-blue-50';
    if (item.type === 'checkout') icon = 'ph-bold ph-key text-emerald-600 bg-emerald-50';
    if (item.type === 'checkin') icon = 'ph-bold ph-arrow-u-down-left text-blue-600 bg-blue-50';
    if (item.type === 'payment') icon = 'ph-bold ph-money text-purple-600 bg-purple-50';

    return `
      <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center ${icon}">
            <i class="${icon.split(' ')[0]} ${icon.split(' ')[1]} text-lg"></i>
          </div>
          <div>
            <div class="font-bold text-slate-800 text-xs">${item.description}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${item.courierName} • ${item.timestamp}</div>
          </div>
        </div>
        ${item.amount !== 0 ? `
          <div class="font-bold text-xs ${item.amount > 0 ? 'text-emerald-600' : 'text-slate-700'}">
            ${item.amount > 0 ? `+${item.amount.toLocaleString()} ₽` : `${item.amount.toLocaleString()} ₽`}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// MODALS LOGIC & SELECT POPULATION
// -------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  if (id === 'checkoutModal') populateCheckoutSelects();
  if (id === 'paymentModal') populatePaymentSelects();
  if (id === 'addBikeModal') populateTemplateSelects();
  if (id === 'addBatteryModal') populateTemplateSelects();

  modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

function populateCheckoutSelects() {
  const courierSelect = document.getElementById('checkoutCourierSelect');
  const bikeSelect = document.getElementById('checkoutBikeSelect');
  const batterySelect = document.getElementById('checkoutBatterySelect');

  // Couriers without bike
  const availableCouriers = state.couriers.filter(c => !c.activeBikeId);
  courierSelect.innerHTML = availableCouriers.length > 0 
    ? availableCouriers.map(c => `<option value="${c.id}">${c.fullName} (${c.phone})</option>`).join('')
    : `<option value="">Нет свободных курьеров</option>`;

  // Available bikes
  const freeBikes = state.bikes.filter(b => b.status === 'available');
  bikeSelect.innerHTML = freeBikes.length > 0 
    ? freeBikes.map(b => `<option value="${b.id}">#${b.id} — ${b.model}</option>`).join('')
    : `<option value="">Нет свободных велосипедов</option>`;

  // Available batteries
  const freeBatteries = state.batteries.filter(b => b.status === 'available');
  batterySelect.innerHTML = freeBatteries.length > 0
    ? freeBatteries.map(b => `<option value="${b.id}">#${b.id} — ${b.type}</option>`).join('')
    : `<option value="">Нет свободных АКБ на складе</option>`;
}

function populatePaymentSelects() {
  const courierSelect = document.getElementById('paymentCourierSelect');
  if (courierSelect) {
    courierSelect.innerHTML = state.couriers.length > 0 
      ? state.couriers.map(c => `<option value="${c.id}">${c.fullName} ${c.debt > 0 ? `(ДОЛГ: ${c.debt.toLocaleString()} ₽)` : ''}</option>`).join('')
      : `<option value="">Нет зарегистрированных курьеров</option>`;
  }
}

// -------------------------------------------------------------
// EDIT MODALS & HANDLERS
// -------------------------------------------------------------

// --- Bike Edit ---
function openEditBike(bikeId) {
  const bike = state.bikes.find(b => b.id === bikeId);
  if (!bike) return;

  document.getElementById('editBikeId').value = bike.id;
  document.getElementById('editBikeIdLabel').innerText = `#${bike.id}`;
  document.getElementById('editBikeFrame').value = bike.frameNumber || '';
  document.getElementById('editBikeMileage').value = bike.mileageKm || 0;
  document.getElementById('editBikeCondition').value = bike.condition || '';
  document.getElementById('editBikeStatusSelect').value = bike.status || 'available';

  populateTemplateSelects();
  const modelSelect = document.getElementById('editBikeModelSelect');
  if (modelSelect) modelSelect.value = bike.model;

  const batSelect = document.getElementById('editBikeBatterySelect');
  if (batSelect) {
    const eligibleBats = state.batteries.filter(b => b.status === 'available' || b.id === bike.batteryId);
    let options = `<option value="">Без аккумулятора</option>`;
    options += eligibleBats.map(b => `
      <option value="${b.id}" ${b.id === bike.batteryId ? 'selected' : ''}>
        #${b.id} — ${b.type} ${b.id === bike.batteryId ? '(Текущий)' : ''}
      </option>
    `).join('');
    batSelect.innerHTML = options;
  }

  openModal('editBikeModal');
}

function handleEditBike(e) {
  e.preventDefault();
  const bikeId = document.getElementById('editBikeId').value;
  const bike = state.bikes.find(b => b.id === bikeId);
  if (!bike) return;

  const model = document.getElementById('editBikeModelSelect').value;
  const frameNumber = document.getElementById('editBikeFrame').value;
  const batteryId = document.getElementById('editBikeBatterySelect').value;
  const status = document.getElementById('editBikeStatusSelect').value;
  const mileageKm = Number(document.getElementById('editBikeMileage').value) || 0;
  const condition = document.getElementById('editBikeCondition').value;

  // Optimistic local update
  bike.model = model;
  bike.frameNumber = frameNumber;
  bike.status = status;
  bike.mileageKm = mileageKm;
  bike.condition = condition;

  if (bike.batteryId !== batteryId) {
    if (bike.batteryId) {
      const oldBat = state.batteries.find(b => b.id === bike.batteryId);
      if (oldBat) { oldBat.status = 'available'; oldBat.assignedBike = null; }
    }
    bike.batteryId = batteryId || null;
    if (batteryId) {
      const newBat = state.batteries.find(b => b.id === batteryId);
      if (newBat) { newBat.status = 'in_use'; newBat.assignedBike = bike.id; }
    }
  }

  saveLocalDatabase();
  closeModal('editBikeModal');
  updateBadges();
  renderCurrentTab();
  showToast(`Байк #${bikeId} успешно сохранен!`, 'success');

  // Background server sync
  fetch(`/api/bikes/${bikeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, frameNumber, batteryId, status, mileageKm, condition })
  }).catch(() => {});
}

// --- Battery Edit ---
function openEditBattery(batId) {
  const bat = state.batteries.find(b => b.id === batId);
  if (!bat) return;

  document.getElementById('editBatteryId').value = bat.id;
  document.getElementById('editBatteryIdLabel').innerText = `#${bat.id}`;
  document.getElementById('editBatNotes').value = bat.notes || '';
  document.getElementById('editBatStatusSelect').value = bat.status || 'available';

  populateTemplateSelects();
  const typeSelect = document.getElementById('editBatTypeSelect');
  if (typeSelect) typeSelect.value = bat.type;

  openModal('editBatteryModal');
}

function handleEditBattery(e) {
  e.preventDefault();
  const batId = document.getElementById('editBatteryId').value;
  const bat = state.batteries.find(b => b.id === batId);
  if (!bat) return;

  const type = document.getElementById('editBatTypeSelect').value;
  const status = document.getElementById('editBatStatusSelect').value;
  const notes = document.getElementById('editBatNotes').value;

  bat.type = type;
  bat.model = `Li-ion ${type}`;
  bat.status = status;
  bat.notes = notes;

  saveLocalDatabase();
  closeModal('editBatteryModal');
  updateBadges();
  renderCurrentTab();
  showToast(`АКБ #${batId} успешно обновлена!`, 'success');

  // Background server sync
  fetch(`/api/batteries/${batId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, status, notes })
  }).catch(() => {});
}

// --- Courier Edit ---
function openEditCourier(courierId) {
  const courier = state.couriers.find(c => c.id === courierId);
  if (!courier) return;

  document.getElementById('editCourierId').value = courier.id;
  document.getElementById('editCourierIdLabel').innerText = `#${courier.id}`;
  document.getElementById('editCourierName').value = courier.fullName || '';
  document.getElementById('editCourierPhone').value = courier.phone || '';
  document.getElementById('editCourierPassport').value = courier.passportNumber || '';
  document.getElementById('editCourierDeposit').value = courier.deposit || 0;
  document.getElementById('editCourierDebt').value = courier.debt || 0;
  document.getElementById('editCourierNotes').value = courier.notes || '';

  // Clean integer rating from 1 to 5
  const ratingInt = String(Math.min(5, Math.max(1, Math.round(Number(courier.rating) || 5))));
  const ratingSelect = document.getElementById('editCourierRating');
  if (ratingSelect) {
    ratingSelect.value = ratingInt;
  }

  openModal('editCourierModal');
}

function handleEditCourier(e) {
  e.preventDefault();
  const courierId = document.getElementById('editCourierId').value;
  const courier = state.couriers.find(c => c.id === courierId);
  if (!courier) return;

  const fullName = document.getElementById('editCourierName').value.trim();
  const phone = document.getElementById('editCourierPhone').value.trim();
  const passportNumber = document.getElementById('editCourierPassport').value.trim();
  const deposit = Number(document.getElementById('editCourierDeposit').value) || 0;
  const debt = Number(document.getElementById('editCourierDebt').value) || 0;
  const ratingSelect = document.getElementById('editCourierRating');
  const rating = ratingSelect ? parseInt(ratingSelect.value, 10) : 5;
  const notes = document.getElementById('editCourierNotes').value.trim();

  courier.fullName = fullName;
  courier.phone = phone;
  courier.passportNumber = passportNumber;
  courier.deposit = deposit;
  courier.debt = debt;
  courier.rating = rating;
  courier.notes = notes;
  courier.status = debt > 0 ? 'debtor' : (courier.activeBikeId ? 'active' : 'waiting');

  saveLocalDatabase();
  closeModal('editCourierModal');
  updateBadges();
  renderCurrentTab();
  showToast(`Профиль курьера «${fullName}» обновлен!`, 'success');

  // Background server sync
  fetch(`/api/couriers/${courierId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, phone, passportNumber, deposit, debt, rating, notes })
  }).catch(() => {});
}

// -------------------------------------------------------------
// ADD HANDLERS (BIKE, BATTERY, COURIER) - 100% INSTANT
// -------------------------------------------------------------
function handleAddBike(e) {
  e.preventDefault();
  const modelSelect = document.getElementById('newBikeModelSelect');
  const model = modelSelect ? modelSelect.value : 'Only U2 Pro';
  
  const frameInput = document.getElementById('newBikeFrame');
  const frameNumber = (frameInput && frameInput.value.trim()) 
    ? frameInput.value.trim() 
    : `U2-${Math.floor(10000 + Math.random() * 90000)}`;
    
  const batterySelect = document.getElementById('newBikeBatterySelect');
  const batteryId = batterySelect ? batterySelect.value : '';
  
  const mileageInput = document.getElementById('newBikeMileage');
  const mileageKm = mileageInput ? (Number(mileageInput.value) || 0) : 0;
  
  const condInput = document.getElementById('newBikeCondition');
  const condition = (condInput && condInput.value.trim()) ? condInput.value.trim() : 'Отличное (готов к выдаче)';

  // Safe unique ID generation
  const maxBikeNum = state.bikes.reduce((max, b) => {
    const match = b.id && b.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 100);
  const newId = `MB-${maxBikeNum + 1}`;

  const newBike = {
    id: newId,
    model,
    frameNumber,
    mileageKm,
    status: 'available',
    batteryId: batteryId || null,
    currentCourierId: null,
    rentalStart: null,
    rentalEnd: null,
    condition,
    location: 'Склад'
  };

  if (batteryId) {
    const bat = state.batteries.find(b => b.id === batteryId);
    if (bat) {
      bat.status = 'in_use';
      bat.assignedBike = newId;
    }
  }

  state.bikes.push(newBike);
  saveLocalDatabase();
  closeModal('addBikeModal');
  if (frameInput) frameInput.value = '';
  updateBadges();
  renderCurrentTab();
  showToast(`Электровелосипед #${newId} добавлен в парк!`, 'success');

  // Background server sync
  fetch('/api/bikes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, frameNumber, batteryId, mileageKm, condition })
  }).catch(() => {});
}

function handleAddBattery(e) {
  e.preventDefault();
  const typeSelect = document.getElementById('newBatTypeSelect');
  const type = typeSelect ? typeSelect.value : '60V 21Ah';
  
  const notesInput = document.getElementById('newBatNotes');
  const notes = notesInput ? notesInput.value.trim() : 'На складе, свободен';

  const maxBatNum = state.batteries.reduce((max, b) => {
    const match = b.id && b.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 0);
  const newId = `BAT-${String(maxBatNum + 1).padStart(2, '0')}`;

  const newBat = {
    id: newId,
    model: `Li-ion ${type}`,
    type,
    status: 'available',
    assignedBike: null,
    notes: notes || 'На складе, свободен'
  };

  state.batteries.push(newBat);
  saveLocalDatabase();
  closeModal('addBatteryModal');
  if (notesInput) notesInput.value = '';
  updateBadges();
  renderCurrentTab();
  showToast(`Аккумулятор #${newId} добавлен в реестр!`, 'success');

  // Background server sync
  fetch('/api/batteries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, notes })
  }).catch(() => {});
}

function handleAddCourier(e) {
  e.preventDefault();
  const fullName = document.getElementById('newCourierName').value.trim();
  const phone = document.getElementById('newCourierPhone').value.trim();
  const passportNumber = document.getElementById('newCourierPassport').value.trim();
  const deposit = Number(document.getElementById('newCourierDeposit').value) || 5000;
  const notes = document.getElementById('newCourierNotes').value.trim();
  const ratingSelect = document.getElementById('newCourierRating');
  const rating = ratingSelect ? parseInt(ratingSelect.value, 10) : 5;

  const maxCourierNum = state.couriers.reduce((max, c) => {
    const match = c.id && c.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 0);
  const newId = `C-${String(maxCourierNum + 1).padStart(2, '0')}`;

  const newCourier = {
    id: newId,
    fullName: fullName || 'Курьер',
    phone: phone || '',
    passportNumber: passportNumber || 'Не указан',
    status: 'waiting',
    balance: 0,
    debt: 0,
    deposit,
    rating,
    activeBikeId: null,
    notes: notes || 'Новый курьер'
  };

  state.couriers.push(newCourier);
  saveLocalDatabase();
  closeModal('addCourierModal');
  document.getElementById('newCourierName').value = '';
  document.getElementById('newCourierPhone').value = '';
  document.getElementById('newCourierPassport').value = '';
  updateBadges();
  renderCurrentTab();
  showToast(`Курьер «${fullName}» зарегистрирован!`, 'success');

  // Background server sync
  fetch('/api/couriers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, phone, passportNumber, deposit, notes, rating })
  }).catch(() => {});
}

// -------------------------------------------------------------
// DELETE HANDLERS (МГНОВЕННОЕ УДАЛЕНИЕ + СОХРАНЕНИЕ)
// -------------------------------------------------------------
function deleteBike(bikeId) {
  if (!bikeId) return;
  const bike = state.bikes.find(b => b.id === bikeId);
  const name = bike ? `${bike.model} #${bike.id}` : `#${bikeId}`;
  
  openConfirmDelete(
    'Удалить электровелосипед?',
    `Вы действительно хотите удалить ${name} из парка?`,
    () => {
      // 1. Unbind attached battery
      if (bike && bike.batteryId) {
        const bat = state.batteries.find(b => b.id === bike.batteryId);
        if (bat) { bat.status = 'available'; bat.assignedBike = null; bat.notes = 'На складе, свободен'; }
      }
      // 2. Unbind courier if rented
      if (bike && bike.currentCourierId) {
        const courier = state.couriers.find(c => c.id === bike.currentCourierId);
        if (courier) { courier.activeBikeId = null; courier.status = 'waiting'; }
      }
      // 3. Remove bike from local state
      state.bikes = state.bikes.filter(b => b.id !== bikeId);
      
      saveLocalDatabase();
      closeModal('editBikeModal');
      updateBadges();
      renderCurrentTab();
      showToast(`Байк #${bikeId} успешно удален!`, 'info');

      // Background server sync
      fetch(`/api/bikes/${bikeId}`, { method: 'DELETE' }).catch(() => {});
    }
  );
}

function deleteBattery(batId) {
  if (!batId) return;
  const bat = state.batteries.find(b => b.id === batId);
  const name = bat ? `${bat.type} #${bat.id}` : `#${batId}`;

  openConfirmDelete(
    'Удалить аккумулятор?',
    `Вы действительно хотите удалить АКБ ${name} из реестра?`,
    () => {
      if (bat && bat.assignedBike) {
        const bike = state.bikes.find(b => b.id === bat.assignedBike);
        if (bike) { bike.batteryId = null; }
      }
      state.batteries = state.batteries.filter(b => b.id !== batId);

      saveLocalDatabase();
      closeModal('editBatteryModal');
      updateBadges();
      renderCurrentTab();
      showToast(`АКБ #${batId} успешно удалена!`, 'info');

      // Background server sync
      fetch(`/api/batteries/${batId}`, { method: 'DELETE' }).catch(() => {});
    }
  );
}

function deleteCourier(courierId) {
  if (!courierId) return;
  const courier = state.couriers.find(c => c.id === courierId);
  const name = courier ? courier.fullName : courierId;

  openConfirmDelete(
    'Удалить карточку курьера?',
    `Удалить курьера «${name}»? Если за ним был закреплен байк, он вернется на склад.`,
    () => {
      // Free rented bike if any
      if (courier && courier.activeBikeId) {
        const bike = state.bikes.find(b => b.id === courier.activeBikeId);
        if (bike) {
          bike.status = 'available';
          bike.currentCourierId = null;
          bike.location = 'Склад';
          bike.rentalStart = null;
          bike.rentalEnd = null;
        }
      }
      state.couriers = state.couriers.filter(c => c.id !== courierId);

      saveLocalDatabase();
      closeModal('editCourierModal');
      updateBadges();
      renderCurrentTab();
      showToast(`Курьер «${name}» удален!`, 'info');

      // Background server sync
      fetch(`/api/couriers/${courierId}`, { method: 'DELETE' }).catch(() => {});
    }
  );
}

// -------------------------------------------------------------
// RENTAL OPERATIONS: CHECKOUT, CHECKIN, PAYMENT
// -------------------------------------------------------------
function handleCheckout(e) {
  e.preventDefault();
  const courierId = document.getElementById('checkoutCourierSelect').value;
  const bikeId = document.getElementById('checkoutBikeSelect').value;
  const batteryId = document.getElementById('checkoutBatterySelect').value;
  const days = Number(document.getElementById('checkoutDaysSelect').value) || 7;
  const depositPaid = Number(document.getElementById('checkoutDepositInput').value) || 0;

  if (!courierId || !bikeId) {
    showToast('Выберите курьера и велосипед!', 'error');
    return;
  }

  const bike = state.bikes.find(b => b.id === bikeId);
  const courier = state.couriers.find(c => c.id === courierId);
  if (!bike || !courier) return;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + days);

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  bike.status = 'in_rent';
  bike.currentCourierId = courier.id;
  bike.rentalStart = startStr;
  bike.rentalEnd = endStr;
  bike.location = 'На линии';

  if (batteryId) {
    bike.batteryId = batteryId;
    const bat = state.batteries.find(b => b.id === batteryId);
    if (bat) { bat.status = 'in_use'; bat.assignedBike = bike.id; }
  }

  courier.activeBikeId = bike.id;
  courier.status = 'active';
  if (depositPaid) courier.deposit = (courier.deposit || 0) + depositPaid;

  state.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkout',
    courierName: courier.fullName,
    bikeId: bike.id,
    batteryId: bike.batteryId,
    amount: 3500,
    description: `Оформлена аренда байка #${bike.id} на ${days} дн.`
  });

  saveLocalDatabase();
  closeModal('checkoutModal');
  updateBadges();
  renderCurrentTab();
  showToast('Велосипед и АКБ успешно выданы курьеру!', 'success');

  fetch('/api/rentals/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courierId, bikeId, batteryId, days, depositPaid, rateAmount: 3500 })
  }).catch(() => {});
}

function prepareCheckin(bikeId) {
  const bike = state.bikes.find(b => b.id === bikeId);
  if (!bike) return;

  const courier = state.couriers.find(c => c.id === bike.currentCourierId);

  document.getElementById('checkinBikeId').value = bike.id;
  document.getElementById('checkinBikeLabel').innerText = `#${bike.id} — ${bike.model}`;
  document.getElementById('checkinCourierLabel').innerText = courier ? courier.fullName : 'Курьер не указан';

  openModal('checkinModal');
}

function handleCheckin(e) {
  e.preventDefault();
  const bikeId = document.getElementById('checkinBikeId').value;
  const conditionNote = document.getElementById('checkinCondition').value;
  const returnDeposit = document.getElementById('checkinReturnDeposit').checked;

  const bike = state.bikes.find(b => b.id === bikeId);
  if (!bike) return;

  const courier = state.couriers.find(c => c.id === bike.currentCourierId);

  bike.status = 'available';
  bike.location = 'Склад';
  bike.currentCourierId = null;
  bike.rentalStart = null;
  bike.rentalEnd = null;
  if (conditionNote) bike.condition = conditionNote;

  if (bike.batteryId) {
    const bat = state.batteries.find(b => b.id === bike.batteryId);
    if (bat) { bat.status = 'available'; bat.assignedBike = null; bat.notes = 'На складе (после возврата)'; }
  }

  if (courier) {
    courier.activeBikeId = null;
    courier.status = courier.debt > 0 ? 'debtor' : 'waiting';
    if (returnDeposit && courier.deposit > 0) courier.deposit = 0;
  }

  state.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkin',
    courierName: courier ? courier.fullName : 'Курьер',
    bikeId: bike.id,
    amount: 0,
    description: `Прием байка #${bike.id} на склад. ${conditionNote || ''}`
  });

  saveLocalDatabase();
  closeModal('checkinModal');
  updateBadges();
  renderCurrentTab();
  showToast('Байк успешно принят на склад!', 'success');

  fetch('/api/rentals/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bikeId, conditionNote, returnDeposit })
  }).catch(() => {});
}

function handlePayment(e) {
  e.preventDefault();
  const courierId = document.getElementById('paymentCourierSelect').value;
  const amount = Number(document.getElementById('paymentAmountInput').value) || 0;
  const paymentTypeRadio = document.querySelector('input[name="paymentType"]:checked');
  const paymentType = paymentTypeRadio ? paymentTypeRadio.value : 'cash';

  if (!courierId) {
    showToast('Выберите курьера!', 'error');
    return;
  }

  const courier = state.couriers.find(c => c.id === courierId);
  if (!courier) return;

  if (courier.debt > 0) {
    const paidDebt = Math.min(courier.debt, amount);
    courier.debt -= paidDebt;
    if (courier.debt === 0 && courier.status === 'debtor') {
      courier.status = courier.activeBikeId ? 'active' : 'waiting';
    }
  }

  state.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'payment',
    courierName: courier.fullName,
    amount,
    description: `${paymentType === 'cash' ? 'Наличные' : 'Перевод/СБП'}: Оплата аренды`
  });

  saveLocalDatabase();
  closeModal('paymentModal');
  updateBadges();
  renderCurrentTab();
  showToast(`Платеж ${amount.toLocaleString()} ₽ зачислен!`, 'success');

  fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courierId, amount, paymentType, note: 'Оплата аренды' })
  }).catch(() => {});
}

function sendToService(bikeId) {
  openConfirmDelete(
    'Отправить на ТО?',
    `Отправить электровелосипед #${bikeId} в ремонтную мастерскую?`,
    () => {
      const bike = state.bikes.find(b => b.id === bikeId);
      if (bike) {
        bike.status = 'service';
        bike.location = 'Мастерская';
      }
      saveLocalDatabase();
      updateBadges();
      renderCurrentTab();
      showToast(`Байк #${bikeId} отправлен на ТО`, 'info');

      fetch(`/api/bikes/${bikeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'service', location: 'Мастерская' })
      }).catch(() => {});
    }
  );
}

function markReadyFromService(bikeId) {
  const bike = state.bikes.find(b => b.id === bikeId);
  if (bike) {
    bike.status = 'available';
    bike.condition = 'Исправен (пройдено ТО)';
    bike.location = 'Склад';
  }
  saveLocalDatabase();
  updateBadges();
  renderCurrentTab();
  showToast(`Байк #${bikeId} готов к выдаче!`, 'success');

  fetch(`/api/bikes/${bikeId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'available', condition: 'Исправен (пройдено ТО)', location: 'Склад' })
  }).catch(() => {});
}

function resetDemoData() {
  openConfirmDelete(
    'Сброс базы данных?',
    'Сбросить все данные к исходным демонстрационным? Это восстановит начальный парк, курьеров и батареи.',
    async () => {
      localStorage.removeItem(DB_STORAGE_KEY);
      try {
        await fetch('/api/reset', { method: 'POST' }).catch(() => {});
      } catch (e) {}
      
      // Reload initial seed
      await initDatabase();
      closeModal('authModal');
      showToast('База данных сброшена к начальным демо-данным!', 'success');
    }
  );
}

function prepareCheckoutForBike(bikeId) {
  openModal('checkoutModal');
  setTimeout(() => {
    const select = document.getElementById('checkoutBikeSelect');
    if (select) select.value = bikeId;
  }, 100);
}

function prepareCheckoutForCourier(courierId) {
  openModal('checkoutModal');
  setTimeout(() => {
    const select = document.getElementById('checkoutCourierSelect');
    if (select) select.value = courierId;
  }, 100);
}

function preparePaymentForCourier(courierId) {
  openModal('paymentModal');
  setTimeout(() => {
    const select = document.getElementById('paymentCourierSelect');
    if (select) select.value = courierId;
  }, 100);
}

// -------------------------------------------------------------
// QR SCAN SIMULATOR
// -------------------------------------------------------------
function simulateScan(bikeId) {
  closeModal('qrModal');
  showToast(`QR распознан: Электробайк #${bikeId}`, 'info');
  switchTab('fleet');
  setTimeout(() => {
    const bike = state.bikes.find(b => b.id === bikeId);
    if (bike) {
      if (bike.status === 'in_rent') {
        prepareCheckin(bikeId);
      } else {
        prepareCheckoutForBike(bikeId);
      }
    }
  }, 300);
}

// -------------------------------------------------------------
// AUTH & TELEGRAM TEST
// -------------------------------------------------------------
async function testTelegramLogin() {
  const tgId = document.getElementById('tgIdInput').value.trim();
  const resEl = document.getElementById('tgAuthResult');
  resEl.classList.remove('hidden');

  try {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: tgId, username: 'Владелец Only U2 Pro' })
    });
    const result = await res.json();

    if (result.success) {
      resEl.className = 'text-[11px] mt-1.5 text-emerald-600 font-semibold';
      resEl.innerText = '✓ Авторизован! Доступ подтвержден (Only U2 Pro).';
      showToast('Успешный вход через Telegram!', 'success');
      document.getElementById('userName').innerText = 'Only U2 Pro Owner';
      setTimeout(() => closeModal('authModal'), 1200);
    } else {
      resEl.className = 'text-[11px] mt-1.5 text-rose-600 font-semibold';
      resEl.innerText = '✕ Доступ запрещен. ID отсутствует в списке владельцев.';
      showToast('Доступ запрещен!', 'error');
    }
  } catch (err) {
    resEl.className = 'text-[11px] mt-1.5 text-rose-600';
    resEl.innerText = 'Ошибка соединения';
  }
}

function demoLogin() {
  showToast('Активирован демонстрационный доступ', 'success');
  closeModal('authModal');
}

// -------------------------------------------------------------
// TOAST NOTIFICATIONS
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  let bg = 'bg-slate-900 text-white';
  let icon = 'ph-bold ph-info';

  if (type === 'success') {
    bg = 'bg-emerald-600 text-white';
    icon = 'ph-bold ph-check-circle';
  } else if (type === 'error') {
    bg = 'bg-rose-600 text-white';
    icon = 'ph-bold ph-warning-circle';
  }

  toast.className = `${bg} px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-semibold transform transition-all duration-300 opacity-0 translate-y-2 pointer-events-auto`;
  toast.innerHTML = `<i class="${icon} text-base"></i><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 20);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Global search listener
function setupEventListeners() {
  const searchInput = document.getElementById('globalSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderCurrentTab();
        return;
      }
      if (state.currentTab !== 'fleet') {
        switchTab('fleet');
      }
      const grid = document.getElementById('fleetGridContainer');
      if (grid && state.currentTab === 'fleet') {
        const filtered = state.bikes.filter(b => 
          b.id.toLowerCase().includes(q) || 
          b.model.toLowerCase().includes(q) || 
          b.frameNumber.toLowerCase().includes(q)
        );
        state.bikes = filtered;
        renderFleet();
      }
    });
  }
}
