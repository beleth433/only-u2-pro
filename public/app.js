// Global State
let state = {
  stats: null,
  bikes: [],
  batteries: [],
  couriers: [],
  history: [],
  currentTab: 'dashboard',
  fleetFilter: 'all',
  batFilter: 'all',
  currentUser: {
    name: 'Владелец Only U2 Pro',
    role: 'owner',
    authorized: true
  }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupDate();
  fetchAllData();
  setupEventListeners();
});

function setupDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date().toLocaleDateString('ru-RU', options);
  const el = document.getElementById('currentDateString');
  if (el) el.innerText = today.charAt(0).toUpperCase() + today.slice(1);
}

// Fetch all data from Backend API
async function fetchAllData() {
  try {
    const [statsRes, bikesRes, batsRes, couriersRes, histRes] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/bikes'),
      fetch('/api/batteries'),
      fetch('/api/couriers'),
      fetch('/api/history')
    ]);

    state.stats = await statsRes.json();
    state.bikes = await bikesRes.json();
    state.batteries = await batsRes.json();
    state.couriers = await couriersRes.json();
    state.history = await histRes.json();

    updateBadges();
    renderCurrentTab();
  } catch (err) {
    console.error('Error loading data:', err);
    showToast('Ошибка загрузки данных', 'error');
  }
}

// Navigation & Tabs
function switchTab(tabId) {
  state.currentTab = tabId;

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
  if (!state.bikes || !state.batteries || !state.couriers) return;

  const totalBikesEl = document.getElementById('badgeTotalBikes');
  if (totalBikesEl) totalBikesEl.innerText = state.bikes.length;

  const availableBats = state.batteries.filter(b => b.status === 'available').length;
  const readyBatsEl = document.getElementById('badgeReadyBatteries');
  if (readyBatsEl) readyBatsEl.innerText = availableBats;

  const debtorsCount = state.couriers.filter(c => c.debt > 0).length;
  const debtorsEl = document.getElementById('badgeDebtors');
  if (debtorsEl) debtorsEl.innerText = debtorsCount;
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
// 1. DASHBOARD RENDER
// -------------------------------------------------------------
function renderDashboard() {
  if (!state.stats) return;

  // KPI counters
  document.getElementById('kpiInRent').innerText = state.stats.fleet.inRent;
  const inRentPct = Math.round((state.stats.fleet.inRent / (state.stats.fleet.total || 1)) * 100);
  document.getElementById('kpiInRentPct').innerText = `${inRentPct}%`;
  document.getElementById('kpiAvailable').innerText = state.stats.fleet.available;

  document.getElementById('kpiReadyBatteries').innerText = state.stats.batteries.available;
  document.getElementById('kpiInUseBatteries').innerText = state.stats.batteries.inUse;

  document.getElementById('kpiTotalDebt').innerText = `${state.stats.couriers.totalDebt.toLocaleString()} ₽`;
  document.getElementById('kpiDebtorsCount').innerText = `${state.stats.couriers.debtorsCount} должн.`;

  document.getElementById('kpiWeeklyRevenue').innerText = `${state.stats.finance.weeklyRevenue.toLocaleString()} ₽`;

  // Render Active Rentals Table
  const tableBody = document.getElementById('activeRentalsTableBody');
  if (!tableBody) return;

  const activeRentals = state.bikes.filter(b => b.status === 'in_rent');
  if (activeRentals.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">В данный момент нет активных аренд</td></tr>`;
  } else {
    tableBody.innerHTML = activeRentals.map(bike => {
      const courier = state.couriers.find(c => c.id === bike.currentCourierId) || { fullName: 'Курьер', phone: '—', deliveryService: 'Доставка', debt: 0 };
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
                  <span>${courier.deliveryService}</span>
                  <span>•</span>
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
              ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Долг ${courier.debt} ₽</span>` 
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
  document.getElementById('countAllBikes').innerText = state.bikes.length;
  document.getElementById('countInRent').innerText = state.bikes.filter(b => b.status === 'in_rent').length;
  document.getElementById('countAvailable').innerText = state.bikes.filter(b => b.status === 'available').length;
  document.getElementById('countService').innerText = state.bikes.filter(b => b.status === 'service').length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">В этой категории нет велосипедов</div>`;
    return;
  }

  container.innerHTML = filtered.map(bike => {
    const courier = state.couriers.find(c => c.id === bike.currentCourierId);
    const battery = state.batteries.find(b => b.id === bike.batteryId);

    let statusBadge = '';
    if (bike.status === 'in_rent') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">В аренде</span>`;
    } else if (bike.status === 'available') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Свободен</span>`;
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
              <span class="text-[11px] text-slate-400 font-mono">${bike.voltage}</span>
            </div>
            ${statusBadge}
          </div>

          <!-- Model & Specs -->
          <h3 class="font-bold text-slate-900 text-base mt-2.5">${bike.model}</h3>
          <div class="text-xs text-slate-500 mt-0.5">
            Рама/VIN: <strong class="font-mono text-slate-700">${bike.frameNumber}</strong>
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

          <!-- Courier / Location -->
          <div class="mt-3 text-xs">
            ${bike.status === 'in_rent' && courier ? `
              <div class="flex items-center space-x-2 p-2 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <i class="ph-bold ph-user text-emerald-700 text-sm"></i>
                <div class="overflow-hidden">
                  <div class="font-bold text-slate-900 truncate">${courier.fullName}</div>
                  <div class="text-[10px] text-slate-500">до ${bike.rentalEnd} • ${courier.deliveryService}</div>
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

  document.getElementById('batCountAll').innerText = state.batteries.length;
  document.getElementById('batCountAvailable').innerText = state.batteries.filter(b => b.status === 'available').length;
  document.getElementById('batCountInUse').innerText = state.batteries.filter(b => b.status === 'in_use').length;

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
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${isAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}">
              ${isAvailable ? 'Свободен (на складе)' : `На байке #${bat.assignedBike || '—'}`}
            </span>
          </div>

          <div class="mt-3">
            <div class="text-base font-bold text-slate-900">${bat.type}</div>
            <div class="text-xs text-slate-500 mt-0.5">${bat.model}</div>
          </div>

          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
            <span class="text-slate-400 text-[11px] block">Примечание:</span>
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

  container.innerHTML = state.couriers.map(c => {
    const isDebtor = c.debt > 0;
    const hasBike = Boolean(c.activeBikeId);
    const bike = hasBike ? state.bikes.find(b => b.id === c.activeBikeId) : null;

    return `
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-sm card-hover flex flex-col justify-between">
        
        <div>
          <!-- Header -->
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">
                ${c.fullName.charAt(0)}
              </div>
              <div>
                <h3 class="font-bold text-slate-900 text-sm leading-snug">${c.fullName}</h3>
                <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                  ${c.deliveryService}
                </span>
              </div>
            </div>

            <!-- Rating -->
            <div class="flex items-center space-x-1 text-xs font-bold text-amber-500">
              <i class="ph-fill ph-star"></i>
              <span>${c.rating}</span>
            </div>
          </div>

          <!-- Contact & Passport -->
          <div class="mt-3 space-y-1 text-xs text-slate-600">
            <div class="flex items-center space-x-1.5">
              <i class="ph ph-phone text-slate-400"></i>
              <a href="tel:${c.phone}" class="hover:text-brand-600 font-medium">${c.phone}</a>
            </div>
            <div class="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <i class="ph ph-identification-card text-slate-400"></i>
              <span>Паспорт: ${c.passportNumber}</span>
            </div>
          </div>

          <!-- Financial Status -->
          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-500">Внесенный залог:</span>
              <span class="font-bold text-slate-800">${c.deposit.toLocaleString()} ₽</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Баланс / Долг:</span>
              ${isDebtor ? `
                <span class="font-bold text-rose-600">Долг ${c.debt} ₽</span>
              ` : `
                <span class="font-bold text-emerald-600">Нет долга</span>
              `}
            </div>
          </div>

          <!-- Assigned Bike -->
          <div class="mt-3 text-xs">
            ${hasBike && bike ? `
              <div class="p-2 rounded-xl bg-brand-50/60 border border-brand-100 text-brand-900 flex items-center justify-between">
                <div>
                  <div class="font-bold">Байк: #${bike.id}</div>
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
// MODALS LOGIC & POPULATION
// -------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  if (id === 'checkoutModal') populateCheckoutSelects();
  if (id === 'paymentModal') populatePaymentSelects();

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
  courierSelect.innerHTML = availableCouriers.map(c => `
    <option value="${c.id}">${c.fullName} (${c.deliveryService})</option>
  `).join('');

  // Available bikes
  const freeBikes = state.bikes.filter(b => b.status === 'available');
  bikeSelect.innerHTML = freeBikes.map(b => `
    <option value="${b.id}">#${b.id} — ${b.model} (${b.voltage})</option>
  `).join('');

  // Available batteries
  const freeBatteries = state.batteries.filter(b => b.status === 'available');
  batterySelect.innerHTML = freeBatteries.map(b => `
    <option value="${b.id}">#${b.id} — ${b.type} (В наличии)</option>
  `).join('');
}

function populatePaymentSelects() {
  const courierSelect = document.getElementById('paymentCourierSelect');
  courierSelect.innerHTML = state.couriers.map(c => `
    <option value="${c.id}">${c.fullName} ${c.debt > 0 ? `(ДОЛГ: ${c.debt} ₽)` : ''}</option>
  `).join('');
}

// -------------------------------------------------------------
// ACTIONS & HANDLERS
// -------------------------------------------------------------
async function handleCheckout(e) {
  e.preventDefault();
  const courierId = document.getElementById('checkoutCourierSelect').value;
  const bikeId = document.getElementById('checkoutBikeSelect').value;
  const batteryId = document.getElementById('checkoutBatterySelect').value;
  const days = document.getElementById('checkoutDaysSelect').value;
  const depositPaid = document.getElementById('checkoutDepositInput').value;

  try {
    const res = await fetch('/api/rentals/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId, bikeId, batteryId, days, depositPaid, rateAmount: 3500 })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('checkoutModal');
      showToast('Велосипед и АКБ успешно выданы курьеру!', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при оформлении выдачи', 'error');
  }
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

async function handleCheckin(e) {
  e.preventDefault();
  const bikeId = document.getElementById('checkinBikeId').value;
  const conditionNote = document.getElementById('checkinCondition').value;
  const returnDeposit = document.getElementById('checkinReturnDeposit').checked;

  try {
    const res = await fetch('/api/rentals/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bikeId, conditionNote, returnDeposit })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('checkinModal');
      showToast('Байк успешно принят на склад!', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при приемке байка', 'error');
  }
}

async function handlePayment(e) {
  e.preventDefault();
  const courierId = document.getElementById('paymentCourierSelect').value;
  const amount = document.getElementById('paymentAmountInput').value;
  const paymentType = document.querySelector('input[name="paymentType"]:checked').value;

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId, amount, paymentType, note: 'Оплата аренды' })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('paymentModal');
      showToast(`Платеж ${amount} ₽ успешно зачислен!`, 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при зачислении платежа', 'error');
  }
}

async function handleAddBike(e) {
  e.preventDefault();
  const model = document.getElementById('newBikeModel').value;
  const frameNumber = document.getElementById('newBikeFrame').value;
  const voltage = document.getElementById('newBikeVoltage').value;
  const mileageKm = document.getElementById('newBikeMileage').value;

  try {
    const res = await fetch('/api/bikes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, frameNumber, voltage, mileageKm })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('addBikeModal');
      showToast('Новый электровелосипед добавлен в парк!', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при добавлении байка', 'error');
  }
}

async function handleAddBattery(e) {
  e.preventDefault();
  const type = document.getElementById('newBatType').value;
  const notes = document.getElementById('newBatNotes').value;

  try {
    const res = await fetch('/api/batteries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, model: `Li-ion ${type}`, notes })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('addBatteryModal');
      showToast('Аккумулятор добавлен в реестр наличия!', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при добавлении АКБ', 'error');
  }
}

async function handleAddCourier(e) {
  e.preventDefault();
  const fullName = document.getElementById('newCourierName').value;
  const phone = document.getElementById('newCourierPhone').value;
  const deliveryService = document.getElementById('newCourierService').value;
  const passportNumber = document.getElementById('newCourierPassport').value;
  const deposit = document.getElementById('newCourierDeposit').value;

  try {
    const res = await fetch('/api/couriers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, phone, deliveryService, passportNumber, deposit })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('addCourierModal');
      showToast(`Курьер ${fullName} успешно зарегистрирован!`, 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Ошибка при добавлении курьера', 'error');
  }
}

async function sendToService(bikeId) {
  if (!confirm(`Отправить байк #${bikeId} на ТО в мастерскую?`)) return;
  await fetch(`/api/bikes/${bikeId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'service', location: 'Мастерская' })
  });
  showToast(`Байк #${bikeId} отправлен на ТО`, 'info');
  fetchAllData();
}

async function markReadyFromService(bikeId) {
  await fetch(`/api/bikes/${bikeId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'available', condition: 'Исправен (пройдено ТО)', location: 'Склад' })
  });
  showToast(`Байк #${bikeId} готов к выдаче!`, 'success');
  fetchAllData();
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
        fetchAllData();
      }
    });
  }
}
