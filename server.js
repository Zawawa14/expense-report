const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Settings ---

app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const { person1_name, person2_name, person1_rate } = req.body;
  if (!person1_name || !person2_name) {
    return res.status(400).json({ error: '名前を入力してください' });
  }
  const rate = parseInt(person1_rate, 10);
  if (isNaN(rate) || rate < 0 || rate > 100) {
    return res.status(400).json({ error: '負担率は0〜100で設定してください' });
  }
  db.prepare(
    'UPDATE settings SET person1_name = ?, person2_name = ?, person1_rate = ? WHERE id = 1'
  ).run(person1_name.trim(), person2_name.trim(), rate);
  res.json({ ok: true });
});

// --- Expenses ---

app.get('/api/expenses', (req, res) => {
  const { year, month } = req.query;
  let rows;
  if (year && month) {
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    rows = db.prepare(
      "SELECT * FROM expenses WHERE date LIKE ? ORDER BY date DESC, id DESC"
    ).all(`${ym}%`);
  } else {
    rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all();
  }
  res.json(rows);
});

app.post('/api/expenses', (req, res) => {
  const { date, category, subcategory, description, amount, paid_by } = req.body;
  if (!date || !category || !amount || !paid_by) {
    return res.status(400).json({ error: '必須項目を入力してください' });
  }
  const amt = parseInt(amount, 10);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: '金額は正の整数で入力してください' });
  }
  const result = db.prepare(
    'INSERT INTO expenses (date, category, subcategory, description, amount, paid_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(date, category, subcategory || null, description || null, amt, paid_by);
  res.json({ id: result.lastInsertRowid, ok: true });
});

app.delete('/api/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Settlement ---

app.get('/api/settlement', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const rows = db.prepare(
    "SELECT paid_by, SUM(amount) as total FROM expenses WHERE date LIKE ? GROUP BY paid_by"
  ).all(`${ym}%`);

  const p1 = settings.person1_name;
  const p2 = settings.person2_name;
  const rate1 = settings.person1_rate;
  const rate2 = 100 - rate1;

  let paid1 = 0, paid2 = 0;
  for (const r of rows) {
    if (r.paid_by === p1) paid1 = r.total;
    else if (r.paid_by === p2) paid2 = r.total;
  }
  const totalExpense = paid1 + paid2;
  const shouldPay1 = Math.round(totalExpense * rate1 / 100);
  const shouldPay2 = totalExpense - shouldPay1;

  // 差分: 正なら受け取るべき額、負なら支払うべき額
  const diff1 = paid1 - shouldPay1; // p1 が多く払っていれば正
  const diff2 = paid2 - shouldPay2;

  let settlement = null;
  if (diff1 > 0) {
    settlement = { from: p2, to: p1, amount: diff1 };
  } else if (diff1 < 0) {
    settlement = { from: p1, to: p2, amount: -diff1 };
  }

  // Category breakdown
  const categories = db.prepare(
    "SELECT category, SUM(amount) as total FROM expenses WHERE date LIKE ? GROUP BY category ORDER BY total DESC"
  ).all(`${ym}%`);

  res.json({
    year: parseInt(year), month: parseInt(month),
    totalExpense,
    person1: { name: p1, rate: rate1, paid: paid1, shouldPay: shouldPay1 },
    person2: { name: p2, rate: rate2, paid: paid2, shouldPay: shouldPay2 },
    settlement,
    categories
  });
});

app.listen(PORT, () => {
  console.log(`家計簿アプリ起動中: http://localhost:${PORT}`);
});
