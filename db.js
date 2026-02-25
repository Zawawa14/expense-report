const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'expenses.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    description TEXT,
    amount INTEGER NOT NULL,
    paid_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    person1_name TEXT NOT NULL DEFAULT 'Aさん',
    person2_name TEXT NOT NULL DEFAULT 'Bさん',
    person1_rate INTEGER NOT NULL DEFAULT 50
  );

  INSERT OR IGNORE INTO settings (id, person1_name, person2_name, person1_rate)
  VALUES (1, 'Aさん', 'Bさん', 50);
`);

module.exports = db;
