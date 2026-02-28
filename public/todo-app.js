'use strict';

// ===== State =====
const state = {
  todos: [],
  stats: { total: 0, active: 0, completed: 0, overdue: 0, categories: [] },
  filter: { status: 'all', priority: '', category: '', search: '' },
};

// ===== DOM References =====
const $form = document.getElementById('todo-form');
const $list = document.getElementById('todo-list');
const $emptyState = document.getElementById('empty-state');
const $filterCount = document.getElementById('filter-count');
const $clearCompleted = document.getElementById('clear-completed');
const $filterTabs = document.querySelectorAll('.filter-tab');
const $filterPriority = document.getElementById('filter-priority');
const $filterCategory = document.getElementById('filter-category');
const $filterSearch = document.getElementById('filter-search');
const $editModal = document.getElementById('edit-modal');
const $editForm = document.getElementById('edit-form');
const $categoryList = document.getElementById('category-list');

// ===== API =====
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).error || 'エラー');
    return res.json();
  },
  async post(url, data) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error((await res.json()).error || 'エラー');
    return res.json();
  },
  async put(url, data) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error((await res.json()).error || 'エラー');
    return res.json();
  },
  async patch(url) {
    const res = await fetch(url, { method: 'PATCH' });
    if (!res.ok) throw new Error((await res.json()).error || 'エラー');
    return res.json();
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'エラー');
    return res.json();
  },
};

// ===== Date Helpers =====
function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function getDueDateStatus(dateStr) {
  if (!dateStr) return null;
  const t = today();
  if (dateStr < t) return 'overdue';
  if (dateStr === t) return 'today';
  const diff = (new Date(dateStr) - new Date(t)) / 86400000;
  if (diff <= 3) return 'soon';
  return 'normal';
}

// ===== Render =====
function renderStats() {
  document.getElementById('stat-total').textContent = state.stats.total;
  document.getElementById('stat-active').textContent = state.stats.active;
  document.getElementById('stat-completed').textContent = state.stats.completed;
  document.getElementById('stat-overdue').textContent = state.stats.overdue;
}

function renderCategoryOptions() {
  // Datalist for form inputs
  $categoryList.innerHTML = state.stats.categories
    .map(c => `<option value="${escHtml(c.category)}">`)
    .join('');

  // Filter dropdown
  const current = $filterCategory.value;
  $filterCategory.innerHTML = '<option value="">カテゴリ: すべて</option>' +
    state.stats.categories.map(c =>
      `<option value="${escHtml(c.category)}"${c.category === current ? ' selected' : ''}>${escHtml(c.category)} (${c.count})</option>`
    ).join('');
}

function renderTodos() {
  const todos = state.todos;
  $filterCount.textContent = `${todos.length}件`;
  $clearCompleted.style.display = state.stats.completed > 0 ? '' : 'none';

  if (todos.length === 0) {
    $emptyState.style.display = '';
    // Remove existing items
    [...$list.querySelectorAll('.todo-item')].forEach(el => el.remove());
    return;
  }
  $emptyState.style.display = 'none';

  // Diff render: remove deleted items
  const existingIds = new Set([...$list.querySelectorAll('.todo-item')].map(el => el.dataset.id));
  const newIds = new Set(todos.map(t => String(t.id)));
  existingIds.forEach(id => {
    if (!newIds.has(id)) $list.querySelector(`.todo-item[data-id="${id}"]`)?.remove();
  });

  // Update or insert todos
  todos.forEach((todo, index) => {
    const existing = $list.querySelector(`.todo-item[data-id="${todo.id}"]`);
    const el = buildTodoEl(todo);
    if (existing) {
      existing.replaceWith(el);
    } else {
      // Insert at correct position
      const items = $list.querySelectorAll('.todo-item');
      if (index < items.length) {
        items[index].before(el);
      } else {
        $list.appendChild(el);
      }
    }
  });
}

function buildTodoEl(todo) {
  const isOverdue = getDueDateStatus(todo.due_date) === 'overdue' && !todo.completed;
  const el = document.createElement('div');
  el.className = `todo-item${todo.completed ? ' todo-item--completed' : ''}${isOverdue ? ' todo-item--overdue' : ''}`;
  el.dataset.id = todo.id;

  const priorityLabel = { high: '高', medium: '中', low: '低' }[todo.priority] || '中';
  const dueDateStatus = getDueDateStatus(todo.due_date);
  const dueDateClass = dueDateStatus ? `todo-due--${dueDateStatus}` : '';
  const dueDateLabel = dueDateStatus === 'overdue' ? '期限切れ' : dueDateStatus === 'today' ? '今日まで' : '';

  el.innerHTML = `
    <div class="todo-main">
      <div class="todo-checkbox-wrapper">
        <input type="checkbox" class="todo-checkbox" data-action="toggle" data-id="${todo.id}" ${todo.completed ? 'checked' : ''} title="${todo.completed ? '未完了に戻す' : '完了にする'}">
      </div>
      <div class="todo-content">
        <div class="todo-header">
          <span class="todo-title">${escHtml(todo.title)}</span>
        </div>
        ${todo.description ? `<div class="todo-description">${escHtml(todo.description)}</div>` : ''}
        <div class="todo-meta">
          <span class="badge-priority badge-priority--${todo.priority}">${priorityLabel}</span>
          ${todo.category ? `<span class="badge-category">${escHtml(todo.category)}</span>` : ''}
          ${todo.due_date ? `<span class="todo-due ${dueDateClass}">📅 ${formatDate(todo.due_date)}${dueDateLabel ? ` (${dueDateLabel})` : ''}</span>` : ''}
        </div>
      </div>
      <div class="todo-actions">
        <button class="icon-btn" data-action="edit" data-id="${todo.id}" title="編集">✏️</button>
        <button class="icon-btn icon-btn--delete" data-action="delete" data-id="${todo.id}" title="削除">🗑️</button>
      </div>
    </div>
    ${todo.completed && todo.completed_at ? `<div class="todo-completed-at">完了: ${todo.completed_at}</div>` : ''}
  `;
  return el;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== Data Loading =====
async function loadAll() {
  const [todos, stats] = await Promise.all([
    api.get(buildTodosUrl()),
    api.get('/api/todos/stats'),
  ]);
  state.todos = todos;
  state.stats = stats;
  renderStats();
  renderCategoryOptions();
  renderTodos();
}

function buildTodosUrl() {
  const params = new URLSearchParams();
  if (state.filter.status !== 'all') params.set('status', state.filter.status);
  if (state.filter.priority) params.set('priority', state.filter.priority);
  if (state.filter.category) params.set('category', state.filter.category);
  if (state.filter.search) params.set('search', state.filter.search);
  const q = params.toString();
  return `/api/todos${q ? '?' + q : ''}`;
}

// ===== Event Handlers =====

// Add Todo Form
$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('input-title').value.trim();
  if (!title) return;
  const data = {
    title,
    description: document.getElementById('input-description').value.trim(),
    category: document.getElementById('input-category').value.trim(),
    priority: document.getElementById('input-priority').value,
    due_date: document.getElementById('input-due-date').value || null,
  };
  try {
    await api.post('/api/todos', data);
    $form.reset();
    await loadAll();
  } catch (err) {
    alert(err.message);
  }
});

// List delegation (toggle, edit, delete)
$list.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) return;

  if (action === 'toggle') {
    // Optimistic UI
    const checkbox = e.target;
    try {
      await api.patch(`/api/todos/${id}/toggle`);
      await loadAll();
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      alert(err.message);
    }
  } else if (action === 'delete') {
    if (!confirm('このTODOを削除しますか？')) return;
    try {
      await api.delete(`/api/todos/${id}`);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  } else if (action === 'edit') {
    const todo = state.todos.find(t => String(t.id) === id);
    if (!todo) return;
    openEditModal(todo);
  }
});

// Filter tabs
$filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    $filterTabs.forEach(t => t.classList.remove('filter-tab--active'));
    tab.classList.add('filter-tab--active');
    state.filter.status = tab.dataset.status;
    loadAll();
  });
});

// Filter controls
$filterPriority.addEventListener('change', () => { state.filter.priority = $filterPriority.value; loadAll(); });
$filterCategory.addEventListener('change', () => { state.filter.category = $filterCategory.value; loadAll(); });

let searchTimer;
$filterSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.filter.search = $filterSearch.value.trim();
    loadAll();
  }, 300);
});

// Clear completed
$clearCompleted.addEventListener('click', async () => {
  if (!confirm('完了済みのTODOをすべて削除しますか？')) return;
  const completed = state.todos.filter(t => t.completed);
  // Load all completed if filtered
  let toDelete;
  if (state.filter.status !== 'completed') {
    const all = await api.get('/api/todos?status=completed');
    toDelete = all;
  } else {
    toDelete = completed;
  }
  await Promise.all(toDelete.map(t => api.delete(`/api/todos/${t.id}`)));
  await loadAll();
});

// ===== Edit Modal =====
function openEditModal(todo) {
  document.getElementById('edit-id').value = todo.id;
  document.getElementById('edit-title').value = todo.title;
  document.getElementById('edit-description').value = todo.description || '';
  document.getElementById('edit-priority').value = todo.priority;
  document.getElementById('edit-category').value = todo.category || '';
  document.getElementById('edit-due-date').value = todo.due_date || '';
  $editModal.style.display = 'flex';
  document.getElementById('edit-title').focus();
}

function closeEditModal() {
  $editModal.style.display = 'none';
  $editForm.reset();
}

document.getElementById('modal-close').addEventListener('click', closeEditModal);
document.getElementById('modal-cancel').addEventListener('click', closeEditModal);
$editModal.addEventListener('click', (e) => { if (e.target === $editModal) closeEditModal(); });

$editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const data = {
    title: document.getElementById('edit-title').value.trim(),
    description: document.getElementById('edit-description').value.trim(),
    category: document.getElementById('edit-category').value.trim(),
    priority: document.getElementById('edit-priority').value,
    due_date: document.getElementById('edit-due-date').value || null,
  };
  try {
    await api.put(`/api/todos/${id}`, data);
    closeEditModal();
    await loadAll();
  } catch (err) {
    alert(err.message);
  }
});

// Keyboard: Esc to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $editModal.style.display !== 'none') closeEditModal();
});

// ===== Init =====
loadAll();
