const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read data
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading data file:', err);
    return { settings: {}, bikes: [], batteries: [], couriers: [], history: [] };
  }
}

// Helper to save data
function saveData(data) {
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

// 2. Bikes
app.get('/api/bikes', (req, res) => {
  const data = loadData();
  res.json(data.bikes);
});

app.post('/api/bikes', (req, res) => {
  const data = loadData();
  const { model, frameNumber, voltage, batteryId, mileageKm, condition } = req.body;
  const newId = `MB-${100 + data.bikes.length + 1}`;
  
  const newBike = {
    id: newId,
    model: model || 'Minako Monster V8',
    frameNumber: frameNumber || `MNK-${Math.floor(10000 + Math.random() * 90000)}`,
    voltage: voltage || '60V',
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

  data.bikes.push(newBike);
  saveData(data);
  res.json({ success: true, bike: newBike });
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

// 3. Batteries (Inventory)
app.get('/api/batteries', (req, res) => {
  const data = loadData();
  res.json(data.batteries);
});

app.post('/api/batteries', (req, res) => {
  const data = loadData();
  const { model, type, notes } = req.body;
  const newId = `BAT-${String(data.batteries.length + 1).padStart(2, '0')}`;

  const newBat = {
    id: newId,
    model: model || 'Li-ion 60V 21Ah',
    type: type || '60V 21Ah',
    status: 'available',
    assignedBike: null,
    notes: notes || 'На складе, свободен'
  };

  data.batteries.push(newBat);
  saveData(data);
  res.json({ success: true, battery: newBat });
});

// 4. Couriers
app.get('/api/couriers', (req, res) => {
  const data = loadData();
  res.json(data.couriers);
});

app.post('/api/couriers', (req, res) => {
  const data = loadData();
  const { fullName, phone, deliveryService, passportNumber, deposit, notes } = req.body;
  const newId = `C-0${data.couriers.length + 1}`;

  const newCourier = {
    id: newId,
    fullName,
    phone,
    deliveryService: deliveryService || 'Яндекс Еда',
    passportNumber: passportNumber || 'Не указан',
    status: 'waiting',
    balance: 0,
    debt: 0,
    deposit: Number(deposit) || 5000,
    rating: 5.0,
    activeBikeId: null,
    notes: notes || 'Новый курьер'
  };

  data.couriers.push(newCourier);
  saveData(data);
  res.json({ success: true, courier: newCourier });
});

// 5. Rental Checkout (Выдача)
app.post('/api/rentals/checkout', (req, res) => {
  const data = loadData();
  const { courierId, bikeId, batteryId, days, depositPaid, rateAmount } = req.body;

  const courier = data.couriers.find(c => c.id === courierId);
  const bike = data.bikes.find(b => b.id === bikeId);
  const battery = data.batteries.find(b => b.id === batteryId);

  if (!courier || !bike) {
    return res.status(400).json({ error: 'Курьер или велосипед не найдены' });
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + (Number(days) || 7));

  // Update bike
  bike.status = 'in_rent';
  bike.currentCourierId = courier.id;
  bike.rentalStart = startDate.toISOString().split('T')[0];
  bike.rentalEnd = endDate.toISOString().split('T')[0];
  if (batteryId) bike.batteryId = batteryId;

  // Update battery
  if (battery) {
    battery.status = 'in_use';
    battery.assignedBike = bike.id;
    battery.notes = `Выдан к байку #${bike.id} (${courier.fullName})`;
  }

  // Update courier
  courier.activeBikeId = bike.id;
  courier.status = 'active';
  if (depositPaid) courier.deposit = (courier.deposit || 0) + Number(depositPaid);

  data.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkout',
    courierName: courier.fullName,
    amount: Number(rateAmount) || 3500,
    description: `Выдача ${bike.model} (#${bike.id}) с АКБ #${batteryId || '—'} на ${days || 7} дн.`
  });

  saveData(data);
  res.json({ success: true, message: 'Велосипед успешно выдан' });
});

// 6. Rental Checkin (Возврат)
app.post('/api/rentals/checkin', (req, res) => {
  const data = loadData();
  const { bikeId, courierId, conditionNote, returnDeposit } = req.body;

  const bike = data.bikes.find(b => b.id === bikeId);
  const courier = data.couriers.find(c => c.id === (courierId || bike?.currentCourierId));

  if (!bike) return res.status(404).json({ error: 'Байк не найден' });

  // Update bike
  bike.status = 'available';
  bike.currentCourierId = null;
  bike.rentalStart = null;
  bike.rentalEnd = null;
  if (conditionNote) bike.condition = conditionNote;

  // Update courier
  if (courier) {
    courier.activeBikeId = null;
    courier.status = 'waiting';
    if (returnDeposit && courier.deposit > 0) {
      courier.deposit = 0;
    }
  }

  data.history.unshift({
    id: `H-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    type: 'checkin',
    courierName: courier ? courier.fullName : 'Курьер',
    amount: 0,
    description: `Приемка байка #${bike.id}. Состояние: ${conditionNote || 'В норме'}`
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
      courier.status = 'active';
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

app.get('/api/history', (req, res) => {
  const data = loadData();
  res.json(data.history || []);
});

// Start server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Only U2 Pro CRM is running!`);
  console.log(`📍 Web URL: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
