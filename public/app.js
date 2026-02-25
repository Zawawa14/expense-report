/* ====================================================
   家計簿アプリ – フロントエンド
   ==================================================== */

let settings = { person1_name: 'Aさん', person2_name: 'Bさん', person1_rate: 50 };
let currentYear, currentMonth;

// ── 初期化 ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;

  // 日付フィールドのデフォルト
  document.getElementById('date').value = toDateStr(today);

  await loadSettings();
  setupNav();
  setupExpenseForm();
  setupSettingsForm();
  setupMonthNav();
  loadList();
});

// ── タブ切り替え ─────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'list') loadList();
    });
  });
}

// ── 設定読み込み ─────────────────────────────────────
async function loadSettings() {
  const res = await fetch('/api/settings');
  settings = await res.json();

  document.getElementById('person1_name').value = settings.person1_name;
  document.getElementById('person2_name').value = settings.person2_name;
  document.getElementById('person1_rate').value = settings.person1_rate;
  updateRateDisplay();
  updatePayerSelect();
}

function updatePayerSelect() {
  const sel = document.getElementById('paid_by');
  const current = sel.value;
  sel.innerHTML = '';
  [settings.person1_name, settings.person2_name].forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateRateDisplay() {
  const rate1 = parseInt(document.getElementById('person1_rate').value, 10);
  const rate2 = 100 - rate1;
  document.getElementById('rate1-val').textContent = rate1;
  document.getElementById('rate2-val').textContent = rate2;
  document.getElementById('rate-person1-label').textContent =
    document.getElementById('person1_name').value || 'Aさん';
  document.getElementById('rate-person2-label').textContent =
    document.getElementById('person2_name').value || 'Bさん';
}

// ── 設定フォーム ─────────────────────────────────────
function setupSettingsForm() {
  document.getElementById('person1_rate').addEventListener('input', updateRateDisplay);
  document.getElementById('person1_name').addEventListener('input', updateRateDisplay);
  document.getElementById('person2_name').addEventListener('input', updateRateDisplay);

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      person1_name: document.getElementById('person1_name').value.trim(),
      person2_name: document.getElementById('person2_name').value.trim(),
      person1_rate: parseInt(document.getElementById('person1_rate').value, 10)
    };
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const msg = document.getElementById('settings-msg');
    if (res.ok) {
      settings = { ...body };
      updatePayerSelect();
      msg.textContent = '保存しました';
      msg.className = 'msg success';
    } else {
      const err = await res.json();
      msg.textContent = err.error;
      msg.className = 'msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
  });
}

// ── 支出入力フォーム ─────────────────────────────────
function setupExpenseForm() {
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      date: form.date.value,
      category: form.category.value,
      subcategory: form.subcategory.value.trim(),
      description: form.description.value.trim(),
      amount: form.amount.value,
      paid_by: form.paid_by.value
    };
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const msg = document.getElementById('input-msg');
    if (res.ok) {
      msg.textContent = '✔ 追加しました';
      msg.className = 'msg success';
      form.subcategory.value = '';
      form.description.value = '';
      form.amount.value = '';
    } else {
      const err = await res.json();
      msg.textContent = err.error;
      msg.className = 'msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
  });
}

// ── 月ナビゲーション ─────────────────────────────────
function setupMonthNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadList();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    loadList();
  });
}

// ── 一覧・精算 ───────────────────────────────────────
async function loadList() {
  document.getElementById('month-label').textContent =
    `${currentYear}年 ${currentMonth}月`;

  const [settlementRes, expensesRes] = await Promise.all([
    fetch(`/api/settlement?year=${currentYear}&month=${currentMonth}`),
    fetch(`/api/expenses?year=${currentYear}&month=${currentMonth}`)
  ]);
  const settlement = await settlementRes.json();
  const expenses = await expensesRes.json();

  renderSettlement(settlement);
  renderCategoryBreakdown(settlement.categories || []);
  renderExpenseList(expenses);
}

function renderSettlement(data) {
  const el = document.getElementById('settlement-content');
  if (!data.totalExpense && data.totalExpense !== 0) {
    el.innerHTML = '<div class="empty-state">データがありません</div>';
    return;
  }

  const p1 = data.person1;
  const p2 = data.person2;

  el.innerHTML = `
    <table class="settlement-table">
      <tr>
        <th></th>
        <th>${p1.name}（${p1.rate}%）</th>
        <th>${p2.name}（${p2.rate}%）</th>
      </tr>
      <tr>
        <td>実際の支払額</td>
        <td>${yen(p1.paid)}</td>
        <td>${yen(p2.paid)}</td>
      </tr>
      <tr>
        <td>負担すべき額</td>
        <td>${yen(p1.shouldPay)}</td>
        <td>${yen(p2.shouldPay)}</td>
      </tr>
      <tr>
        <td>差分</td>
        <td>${diffText(p1.paid - p1.shouldPay)}</td>
        <td>${diffText(p2.paid - p2.shouldPay)}</td>
      </tr>
    </table>
    <div class="total-row" style="text-align:right; font-size:0.88rem; color:var(--muted); margin-bottom:0.6rem;">
      合計支出：<strong>${yen(data.totalExpense)}</strong>
    </div>
    ${renderSettlementResult(data.settlement)}
  `;
}

function renderSettlementResult(s) {
  if (!s) {
    return `<div class="settlement-result balanced">精算不要（差額なし）</div>`;
  }
  return `
    <div class="settlement-result">
      <span class="amount">${s.from}</span> が
      <span class="amount">${s.to}</span> に
      <span class="amount">${yen(s.amount)}</span> 支払う
    </div>`;
}

function renderCategoryBreakdown(categories) {
  const el = document.getElementById('category-breakdown');
  if (!categories.length) {
    el.innerHTML = '<div class="empty-state">データがありません</div>';
    return;
  }
  el.innerHTML = categories.map(c => `
    <div class="cat-row">
      <div class="cat-label">
        <span class="cat-badge">${c.category}</span>
      </div>
      <div class="cat-amount">${yen(c.total)}</div>
    </div>
  `).join('');
}

function renderExpenseList(expenses) {
  const el = document.getElementById('expense-list');
  if (!expenses.length) {
    el.innerHTML = '<div class="empty-state">支出がありません</div>';
    return;
  }
  el.innerHTML = expenses.map(e => `
    <div class="expense-item" id="ei-${e.id}">
      <div class="expense-info">
        <div class="expense-date">${e.date}</div>
        <div class="expense-main">${e.category}${e.subcategory ? ` ／ ${e.subcategory}` : ''}</div>
        ${e.description ? `<div class="expense-sub">${escHtml(e.description)}</div>` : ''}
      </div>
      <div class="expense-right">
        <div class="expense-amount">${yen(e.amount)}</div>
        <div class="expense-payer">${escHtml(e.paid_by)}</div>
        <button class="btn-delete" onclick="deleteExpense(${e.id})">削除</button>
      </div>
    </div>
  `).join('');
}

async function deleteExpense(id) {
  if (!confirm('この支出を削除しますか？')) return;
  await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  loadList();
}

// ── ユーティリティ ────────────────────────────────────
function yen(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

function diffText(diff) {
  if (diff > 0) return `<span style="color:var(--success)">+${yen(diff)}</span>`;
  if (diff < 0) return `<span style="color:var(--danger)">${yen(diff)}</span>`;
  return '±0';
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
