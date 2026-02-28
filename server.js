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
    // Bug fix: validate year/month are integers to prevent LIKE pattern injection
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: '無効な年月です' });
    }
    const ym = `${y}-${String(m).padStart(2, '0')}`;
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
  // Bug fix: validate ID is a positive integer before touching the DB
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: '無効なIDです' });
  }
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: '該当する支出が見つかりません' });
  }
  res.json({ ok: true });
});

// --- Settlement ---

app.get('/api/settlement', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  // Bug fix: validate year/month are integers to prevent LIKE pattern injection
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    return res.status(400).json({ error: '無効な年月です' });
  }
  const ym = `${y}-${String(m).padStart(2, '0')}`;
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
    year: y, month: m,
    totalExpense,
    person1: { name: p1, rate: rate1, paid: paid1, shouldPay: shouldPay1 },
    person2: { name: p2, rate: rate2, paid: paid2, shouldPay: shouldPay2 },
    settlement,
    categories
  });
});

// --- Todos ---

app.get('/api/todos', (req, res) => {
  const { status, priority, category, search } = req.query;
  let query = 'SELECT * FROM todos WHERE 1=1';
  const params = [];

  if (status === 'active') {
    query += ' AND completed = 0';
  } else if (status === 'completed') {
    query += ' AND completed = 1';
  }

  if (priority && ['high', 'medium', 'low'].includes(priority)) {
    query += ' AND priority = ?';
    params.push(priority);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like);
  }

  query += ' ORDER BY completed ASC, CASE priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 END, due_date ASC, id DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.get('/api/todos/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM todos').get().count;
  const active = db.prepare('SELECT COUNT(*) as count FROM todos WHERE completed = 0').get().count;
  const completed = db.prepare('SELECT COUNT(*) as count FROM todos WHERE completed = 1').get().count;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = db.prepare(
    "SELECT COUNT(*) as count FROM todos WHERE completed = 0 AND due_date IS NOT NULL AND due_date < ?"
  ).get(today).count;
  const categories = db.prepare(
    "SELECT category, COUNT(*) as count FROM todos WHERE category != '' GROUP BY category ORDER BY count DESC"
  ).all();
  res.json({ total, active, completed, overdue, categories });
});

app.post('/api/todos', (req, res) => {
  const { title, description, category, priority, due_date } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'タイトルを入力してください' });
  }
  const validPriority = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
  const result = db.prepare(
    'INSERT INTO todos (title, description, category, priority, due_date) VALUES (?, ?, ?, ?, ?)'
  ).run(title.trim(), description || '', category || '', validPriority, due_date || null);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.json(todo);
});

app.put('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: '無効なIDです' });

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) return res.status(404).json({ error: 'TODOが見つかりません' });

  const { title, description, category, priority, due_date } = req.body;
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'タイトルを入力してください' });
  }
  const validPriority = ['high', 'medium', 'low'].includes(priority) ? priority : todo.priority;

  db.prepare(
    'UPDATE todos SET title = ?, description = ?, category = ?, priority = ?, due_date = ? WHERE id = ?'
  ).run(
    (title || todo.title).trim(),
    description !== undefined ? description : todo.description,
    category !== undefined ? category : todo.category,
    validPriority,
    due_date !== undefined ? (due_date || null) : todo.due_date,
    id
  );
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json(updated);
});

app.patch('/api/todos/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: '無効なIDです' });

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) return res.status(404).json({ error: 'TODOが見つかりません' });

  const newCompleted = todo.completed ? 0 : 1;
  const completedAt = newCompleted ? new Date().toLocaleString('ja-JP') : null;
  db.prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?').run(newCompleted, completedAt, id);
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: '無効なIDです' });
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'TODOが見つかりません' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`アプリ起動中: http://localhost:${PORT}`);
});
