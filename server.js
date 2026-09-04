const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_FILE = IS_VERCEL ? path.join('/tmp', 'data.json') : path.join(__dirname, 'data.json');
const SEED_FILE = path.join(__dirname, 'seed.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let inMemoryData = null;

// Helper to read data
function loadData() {
  if (inMemoryData) return inMemoryData;
  try {
    if (IS_VERCEL && !fs.existsSync(DATA_FILE)) {
      if (fs.existsSync(SEED_FILE)) {
        fs.copyFileSync(SEED_FILE, DATA_FILE);
      }
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    inMemoryData = JSON.parse(raw);
    return inMemoryData;
  } catch (err) {
    console.error('Error reading data file:', err);
    if (fs.existsSync(SEED_FILE)) {
      try {
        const seedRaw = fs.readFileSync(SEED_FILE, 'utf8');
        inMemoryData = JSON.parse(seedRaw);
        return inMemoryData;
      } catch (e) {}
    }
    return { settings: {}, bikes: [], batteries: [], couriers: [], history: [] };
  }
}

// Helper to save data
function saveData(data) {
  inMemoryData = data;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing data file:', err);
  }
}

// --- API ROUTES ---

// 1. Dashboard Stats
app.get('/api/stats', (req, res) => {
  const data = loadData();
  const totalBikes = data.bikes.length;
  const inRent = data.bikes.filter(b => b.status === 'in_rent').length;
  const availableBikes = data.bikes.filter(b => b.status === 'available').length;
  const inService = data.bikes.filter(b => b.status === 'service').length;

  const totalBatteries = data.batteries.length;
  const availableBatteries = data.batteries.filter(b => b.status === 'available').length;
  const inUseBatteries = data.batteries.filter(b => b.status === 'in_use').length;

  const totalCouriers = data.couriers.length;
  const debtors = data.couriers.filter(c => c.debt > 0);
  const totalDebt = debtors.reduce((acc, c) => acc + (c.debt || 0), 0);

  const estimatedWeeklyRevenue = inRent * 3500;

  res.json({
    fleet: {
      total: totalBikes,
      inRent,
      available: availableBikes,
      inService
    },
    batteries: {
      total: totalBatteries,
      available: availableBatteries,
      inUse: inUseBatteries
    },
    couriers: {
      total: totalCouriers,
      debtorsCount: debtors.length,
      totalDebt
    },
    finance: {
      weeklyRevenue: estimatedWeeklyRevenue,
      todayPayments: 4000
    },
    settings: data.settings
  });
});

// --- TEMPLATES (Модели байков и типы АКБ) ---
app.get('/api/templates', (req, res) => {
  const data = loadData();
  const templates = data.settings.templates || {
    bikeModels: ["Only U2 Pro", "Minako Monster V8", "Minako Monster Max", "Jetson V8 Pro", "Kugoo Kirin V1 Pro"],
    batteryTypes: ["60V 21Ah", "60V 30Ah Увеличенная", "48V 18Ah", "60V 24Ah"]
  };
  res.json(templates);
});

app.post('/api/templates/bike-models', (req, res) => {
  const data = loadData();
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  const { name } = req.body;
  if (name && !data.settings.templates.bikeModels.includes(name.trim())) {
    data.settings.templates.bikeModels.push(name.trim());
    saveData(data);
  }
  res.json({ success: true, templates: data.settings.templates });
});

app.delete('/api/templates/bike-models/:name', (req, res) => {
  const data = loadData();
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  const name = decodeURIComponent(req.params.name).trim();
  data.settings.templates.bikeModels = (data.settings.templates.bikeModels || []).filter(m => m !== name);
  saveData(data);
  res.json({ success: true, templates: data.settings.templates });
});

app.post('/api/templates/battery-types', (req, res) => {
  const data = loadData();
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  const { name } = req.body;
  if (name && !data.settings.templates.batteryTypes.includes(name.trim())) {
    data.settings.templates.batteryTypes.push(name.trim());
    saveData(data);
  }
  res.json({ success: true, templates: data.settings.templates });
});

app.delete('/api/templates/battery-types/:name', (req, res) => {
  const data = loadData();
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  const name = decodeURIComponent(req.params.name).trim();
  data.settings.templates.batteryTypes = (data.settings.templates.batteryTypes || []).filter(t => t !== name);
  saveData(data);
  res.json({ success: true, templates: data.settings.templates });
});

// 2. Bikes
app.get('/api/bikes', (req, res) => {
  const data = loadData();
  res.json(data.bikes);
});

app.post('/api/bikes', (req, res) => {
  const data = loadData();
  const { model, frameNumber, batteryId, mileageKm, condition } = req.body;
  
  // Safe max-based ID generation to prevent duplicates
  const maxBikeNum = data.bikes.reduce((max, b) => {
    const match = b.id && b.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 100);
  const newId = `MB-${maxBikeNum + 1}`;
  
  const bikeModel = model ? model.trim() : 'Only U2 Pro';

  const newBike = {
    id: newId,
    model: bikeModel,
    frameNumber: frameNumber ? frameNumber.trim() : `U2-${Math.floor(10000 + Math.random() * 90000)}`,
    mileageKm: Number(mileageKm) || 0,
    status: 'available',
    batteryId: batteryId || null,
    currentCourierId: null,
    rentalStart: null,
    rentalEnd: null,
    condition: condition || 'Отличное (готов к выдаче)',
    location: 'Склад'
  };

  if (batteryId) {
    const bat = data.batteries.find(b => b.id === batteryId);
    if (bat) {
      bat.status = 'in_use';
      bat.assignedBike = newId;
    }
  }

  // Auto-save model to templates if new
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  if (!data.settings.templates.bikeModels.includes(bikeModel)) {
    data.settings.templates.bikeModels.push(bikeModel);
  }

  data.bikes.push(newBike);
  saveData(data);
  res.json({ success: true, bike: newBike });
});

// Full update for bike
app.patch('/api/bikes/:id', (req, res) => {
  const data = loadData();
  const bike = data.bikes.find(b => b.id === req.params.id);
  if (!bike) return res.status(404).json({ error: 'Bike not found' });

  const { model, frameNumber, mileageKm, condition, status, location, batteryId } = req.body;
  if (model !== undefined) bike.model = model.trim();
  if (frameNumber !== undefined) bike.frameNumber = frameNumber.trim();
  if (mileageKm !== undefined) bike.mileageKm = Number(mileageKm) || 0;
  if (condition !== undefined) bike.condition = condition;
  if (status !== undefined) bike.status = status;
  if (location !== undefined) bike.location = location;

  if (batteryId !== undefined) {
    // If old battery was different, release it
    if (bike.batteryId && bike.batteryId !== batteryId) {
      const oldBat = data.batteries.find(b => b.id === bike.batteryId);
      if (oldBat) {
        oldBat.status = 'available';
        oldBat.assignedBike = null;
      }
    }
    bike.batteryId = batteryId || null;
    if (batteryId) {
      const newBat = data.batteries.find(b => b.id === batteryId);
      if (newBat) {
        newBat.status = 'in_use';
        newBat.assignedBike = bike.id;
      }
    }
  }

  // Auto-save model to templates
  if (model && data.settings.templates && !data.settings.templates.bikeModels.includes(model.trim())) {
    data.settings.templates.bikeModels.push(model.trim());
  }

  saveData(data);
  res.json({ success: true, bike });
});

app.patch('/api/bikes/:id/status', (req, res) => {
  const data = loadData();
  const bike = data.bikes.find(b => b.id === req.params.id);
  if (!bike) return res.status(404).json({ error: 'Bike not found' });

  const { status, condition, location } = req.body;
  if (status) bike.status = status;
  if (condition) bike.condition = condition;
  if (location) bike.location = location;

  saveData(data);
  res.json({ success: true, bike });
});

app.delete('/api/bikes/:id', (req, res) => {
  const data = loadData();
  const bikeIndex = data.bikes.findIndex(b => b.id === req.params.id);
  if (bikeIndex === -1) return res.status(404).json({ error: 'Bike not found' });

  const bike = data.bikes[bikeIndex];

  // If bike had assigned battery, release it
  if (bike.batteryId) {
    const bat = data.batteries.find(b => b.id === bike.batteryId);
    if (bat) {
      bat.status = 'available';
      bat.assignedBike = null;
      bat.notes = 'На складе, свободен';
    }
  }

  // If courier was renting this bike, unassign
  if (bike.currentCourierId) {
    const courier = data.couriers.find(c => c.id === bike.currentCourierId);
    if (courier) {
      courier.activeBikeId = null;
      courier.status = 'waiting';
    }
  }

  data.bikes.splice(bikeIndex, 1);
  saveData(data);
  res.json({ success: true, message: `Байк #${req.params.id} успешно удален` });
});

// 3. Batteries (Inventory)
app.get('/api/batteries', (req, res) => {
  const data = loadData();
  res.json(data.batteries);
});

app.post('/api/batteries', (req, res) => {
  const data = loadData();
  const { type, notes } = req.body;
  
  // Safe max-based ID generation
  const maxBatNum = data.batteries.reduce((max, b) => {
    const match = b.id && b.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 0);
  const newId = `BAT-${String(maxBatNum + 1).padStart(2, '0')}`;

  const batType = type ? type.trim() : '60V 21Ah';

  const newBat = {
    id: newId,
    model: `Li-ion ${batType}`,
    type: batType,
    status: 'available',
    assignedBike: null,
    notes: notes || 'На складе, свободен'
  };

  // Auto-save battery type to templates
  if (!data.settings.templates) {
    data.settings.templates = { bikeModels: [], batteryTypes: [] };
  }
  if (!data.settings.templates.batteryTypes.includes(batType)) {
    data.settings.templates.batteryTypes.push(batType);
  }

  data.batteries.push(newBat);
  saveData(data);
  res.json({ success: true, battery: newBat });
});

// Full update for battery
app.patch('/api/batteries/:id', (req, res) => {
  const data = loadData();
  const bat = data.batteries.find(b => b.id === req.params.id);
  if (!bat) return res.status(404).json({ error: 'Battery not found' });

  const { type, notes, status } = req.body;
  if (type !== undefined) {
    bat.type = type.trim();
    bat.model = `Li-ion ${type.trim()}`;
    if (data.settings.templates && !data.settings.templates.batteryTypes.includes(type.trim())) {
      data.settings.templates.batteryTypes.push(type.trim());
    }
  }
  if (notes !== undefined) bat.notes = notes;
  if (status !== undefined) bat.status = status;

  saveData(data);
  res.json({ success: true, battery: bat });
});

app.delete('/api/batteries/:id', (req, res) => {
  const data = loadData();
  const batIndex = data.batteries.findIndex(b => b.id === req.params.id);
  if (batIndex === -1) return res.status(404).json({ error: 'Battery not found' });

  const bat = data.batteries[batIndex];

  // If assigned to a bike, release from bike
  if (bat.assignedBike) {
    const bike = data.bikes.find(b => b.id === bat.assignedBike);
    if (bike) {
      bike.batteryId = null;
    }
  }

  data.batteries.splice(batIndex, 1);
  saveData(data);
  res.json({ success: true, message: `АКБ #${req.params.id} успешно удалена` });
});

// 4. Couriers
app.get('/api/couriers', (req, res) => {
  const data = loadData();
  res.json(data.couriers);
});

app.post('/api/couriers', (req, res) => {
  const data = loadData();
  const { fullName, phone, passportNumber, deposit, notes, rating } = req.body;
  
  // Safe max-based ID generation
  const maxCourierNum = data.couriers.reduce((max, c) => {
    const match = c.id && c.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 0);
  const newId = `C-${String(maxCourierNum + 1).padStart(2, '0')}`;

  const cleanRating = rating ? Math.min(5, Math.max(1, parseInt(rating, 10) || 5)) : 5;

  const newCourier = {
    id: newId,
    fullName: fullName ? fullName.trim() : 'Курьер',
    phone: phone ? phone.trim() : '',
    passportNumber: passportNumber ? passportNumber.trim() : 'Не указан',
    status: 'waiting',
    balance: 0,
    debt: 0,
    deposit: Number(deposit) || 5000,
    rating: cleanRating,
    activeBikeId: null,
    notes: notes || 'Новый курьер'
  };

  data.couriers.push(newCourier);
  saveData(data);
  res.json({ success: true, courier: newCourier });
});

// Full update for courier
app.patch('/api/couriers/:id', (req, res) => {
  const data = loadData();
  const courier = data.couriers.find(c => c.id === req.params.id);
  if (!courier) return res.status(404).json({ error: 'Courier not found' });

  const { fullName, phone, passportNumber, deposit, debt, rating, notes } = req.body;
  if (fullName !== undefined) courier.fullName = fullName.trim();
  if (phone !== undefined) courier.phone = phone.trim();
  if (passportNumber !== undefined) courier.passportNumber = passportNumber.trim();
  if (deposit !== undefined) courier.deposit = Number(deposit) || 0;
  if (debt !== undefined) {
    courier.debt = Number(debt) || 0;
    if (courier.debt > 0) {
      courier.status = 'debtor';
    } else if (courier.status === 'debtor') {
      courier.status = courier.activeBikeId ? 'active' : 'waiting';
    }
  }
  if (rating !== undefined) {
    const r = parseInt(rating, 10);
    courier.rating = isNaN(r) ? 5 : Math.min(5, Math.max(1, r));
  }
  if (notes !== undefined) courier.notes = notes;

  saveData(data);
  res.json({ success: true, courier });
});

app.delete('/api/couriers/:id', (req, res) => {
  const data = loadData();
  const courierIndex = data.couriers.findIndex(c => c.id === req.params.id);
  if (courierIndex === -1) return res.status(404).json({ error: 'Courier not found' });

  const courier = data.couriers[courierIndex];

  // If courier was renting a bike, release bike
  if (courier.activeBikeId) {
    const bike = data.bikes.find(b => b.id === courier.activeBikeId);
    if (bike) {
      bike.status = 'available';
      bike.currentCourierId = null;
      bike.location = 'Склад';
      bike.rentalStart = null;
      bike.rentalEnd = null;
    }
  }

  data.couriers.splice(courierIndex, 1);
  saveData(data);
  res.json({ success: true, message: `Курьер ${courier.fullName} успешно удален` });
});

// Database reset
app.post('/api/reset', (req, res) => {
  try {
    const rawSeed = fs.readFileSync(SEED_FILE, 'utf8');
    const seedData = JSON.parse(rawSeed);
    inMemoryData = seedData;
    saveData(seedData);
    res.json({ success: true, message: 'Данные успешно сброшены к начальному состоянию!' });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сбросить данные' });
  }
});

// 5. Rental Operations: Checkout (Выдача)
app.post('/api/rentals/checkout', (req, res) => {
  const data = loadData();
  const { courierId, bikeId, batteryId, days, depositPaid, rateAmount } = req.body;

  const bike = data.bikes.find(b => b.id === bikeId);
  const courier = data.couriers.find(c => c.id === courierId);
  if (!bike || !courier) return res.status(404).json({ error: 'Байк или курьер не найдены' });

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + (Number(days) || 7));

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // Update bike
  bike.status = 'in_rent';
  bike.currentCourierId = courier.id;
  bike.rentalStart = startStr;
  bike.rentalEnd = endStr;
  bike.location = 'На линии';

  // Attach battery
  if (batteryId) {
    bike.batteryId = batteryId;
    const bat = data.batteries.find(b => b.id === batteryId);
    if (bat) {
      bat.status = 'in_use';
      bat.assignedBike = bike.id;
    }
  }

  // Update courier
  courier.activeBikeId = bike.id;
  courier.status = 'active';
  if (depositPaid) courier.deposit = (courier.deposit || 0) + Number(depositPaid);

  // History log
  data.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkout',
    courierName: courier.fullName,
    bikeId: bike.id,
    batteryId: bike.batteryId,
    amount: Number(rateAmount) || 3500,
    description: `Оформлена аренда байка #${bike.id} на ${days || 7} дн.`
  });

  saveData(data);
  res.json({ success: true, bike, courier });
});

// 6. Rental Operations: Checkin (Возврат)
app.post('/api/rentals/checkin', (req, res) => {
  const data = loadData();
  const { bikeId, conditionNote, returnDeposit } = req.body;

  const bike = data.bikes.find(b => b.id === bikeId);
  if (!bike) return res.status(404).json({ error: 'Байк не найден' });

  const courier = data.couriers.find(c => c.id === bike.currentCourierId);

  // Free bike
  bike.status = 'available';
  bike.location = 'Склад';
  bike.currentCourierId = null;
  bike.rentalStart = null;
  bike.rentalEnd = null;
  if (conditionNote) bike.condition = conditionNote;

  // Free battery
  if (bike.batteryId) {
    const bat = data.batteries.find(b => b.id === bike.batteryId);
    if (bat) {
      bat.status = 'available';
      bat.assignedBike = null;
      bat.notes = 'На складе (после возврата)';
    }
  }

  // Update courier
  if (courier) {
    courier.activeBikeId = null;
    courier.status = courier.debt > 0 ? 'debtor' : 'waiting';
    if (returnDeposit && courier.deposit > 0) {
      courier.deposit = 0;
    }
  }

  // History log
  data.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkin',
    courierName: courier ? courier.fullName : 'Неизвестный курьер',
    bikeId: bike.id,
    amount: 0,
    description: `Прием байка #${bike.id} на склад. ${conditionNote || ''}`
  });

  saveData(data);
  res.json({ success: true, message: 'Байк успешно принят на склад' });
});

// 7. Payments
app.post('/api/payments', (req, res) => {
  const data = loadData();
  const { courierId, amount, paymentType, note } = req.body;

  const courier = data.couriers.find(c => c.id === courierId);
  if (!courier) return res.status(404).json({ error: 'Курьер не найден' });

  const sum = Number(amount) || 0;
  if (courier.debt > 0) {
    const paidDebt = Math.min(courier.debt, sum);
    courier.debt -= paidDebt;
    if (courier.debt === 0 && courier.status === 'debtor') {
      courier.status = courier.activeBikeId ? 'active' : 'waiting';
    }
  }

  data.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'payment',
    courierName: courier.fullName,
    amount: sum,
    description: `${paymentType === 'cash' ? 'Наличные' : 'Перевод/СБП'}: ${note || 'Оплата аренды'}`
  });

  saveData(data);
  res.json({ success: true, message: 'Платеж успешно проведен', courier });
});

// 8. Auth
app.post('/api/auth/demo', (req, res) => {
  res.json({
    success: true,
    user: {
      name: 'Владелец Only U2 Pro',
      role: 'owner'
    },
    token: 'demo-token-12345'
  });
});

app.post('/api/auth/telegram', (req, res) => {
  const { telegramId, username } = req.body;
  const data = loadData();
  const allowed = data.settings.allowedTelegramIds || [];

  const idNum = Number(telegramId);
  if (allowed.includes(idNum) || telegramId === 'admin') {
    res.json({
      success: true,
      user: {
        name: username || 'Владелец Only U2 Pro',
        role: 'owner',
        telegramId
      },
      token: `tg-token-${Date.now()}`
    });
  } else {
    res.status(403).json({
      error: 'Доступ запрещен. Ваш Telegram ID не найден в белом списке владельцев.'
    });
  }
});

app.get('/api/all-data', (req, res) => {
  const data = loadData();
  res.json(data);
});

app.get('/api/history', (req, res) => {
  const data = loadData();
  res.json(data.history || []);
});

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Only U2 Pro CRM is running!`);
    console.log(`📍 Web URL: http://localhost:${PORT}`);
    console.log(`=========================================`);
  });
}

module.exports = app;
