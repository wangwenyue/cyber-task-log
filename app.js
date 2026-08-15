const STORAGE_KEY = 'neon-log-tasks-v1';
const state = {
  tasks: loadTasks(),
  selectedDate: toDateKey(new Date()),
  calendarDate: startOfMonth(new Date()),
  showCompleted: false,
  editingId: null,
};

const elements = {
  calendarMonth: document.querySelector('#calendarMonth'), calendarYear: document.querySelector('#calendarYear'),
  calendarGrid: document.querySelector('#calendarGrid'), selectedDateTitle: document.querySelector('#selectedDateTitle'),
  selectedDateMeta: document.querySelector('#selectedDateMeta'), taskForm: document.querySelector('#taskForm'),
  taskInput: document.querySelector('#taskInput'), taskList: document.querySelector('#taskList'),
  activeCount: document.querySelector('#activeCount'), progressRing: document.querySelector('#progressRing'),
  progressValue: document.querySelector('#progressValue'), showCompletedButton: document.querySelector('#showCompletedButton'),
  historyList: document.querySelector('#historyList'), completedStat: document.querySelector('#completedStat'),
  activeDaysStat: document.querySelector('#activeDaysStat'), completionStat: document.querySelector('#completionStat'),
  editDialog: document.querySelector('#editDialog'), editForm: document.querySelector('#editForm'),
  editInput: document.querySelector('#editInput'), toast: document.querySelector('#toast'),
};

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

function tasksForDate(dateKey) { return state.tasks.filter((task) => task.date === dateKey); }

function formatDate(date, options) {
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

function renderCalendar() {
  const view = state.calendarDate;
  elements.calendarMonth.textContent = `${view.getMonth() + 1} 月`;
  elements.calendarYear.textContent = `${view.getFullYear()} // CALENDAR`;
  elements.calendarGrid.innerHTML = '';
  const firstWeekday = (view.getDay() + 6) % 7;
  const firstCell = new Date(view.getFullYear(), view.getMonth(), 1 - firstWeekday);

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    const key = toDateKey(date);
    const dailyTasks = tasksForDate(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    if (!sameMonth(date, view)) button.classList.add('outside');
    if (key === toDateKey(new Date())) button.classList.add('today');
    if (key === state.selectedDate) button.classList.add('selected');
    if (dailyTasks.length && dailyTasks.every((task) => task.completed)) button.classList.add('all-done');
    button.innerHTML = `<span>${date.getDate()}</span>${dailyTasks.length ? '<i class="day-dot"></i>' : ''}`;
    button.setAttribute('aria-label', `${formatDate(date, { month: 'long', day: 'numeric' })}，${dailyTasks.length} 项任务`);
    button.addEventListener('click', () => selectDate(key));
    elements.calendarGrid.appendChild(button);
  }
}

function renderTasks() {
  const selected = fromDateKey(state.selectedDate);
  const all = tasksForDate(state.selectedDate).sort((a, b) => b.createdAt - a.createdAt);
  const visible = state.showCompleted ? all : all.filter((task) => !task.completed);
  const completedCount = all.filter((task) => task.completed).length;
  const progress = all.length ? Math.round(completedCount / all.length * 100) : 0;
  elements.selectedDateTitle.textContent = formatDate(selected, { month: 'long', day: 'numeric', weekday: 'long' });
  elements.selectedDateMeta.textContent = `${state.selectedDate.replaceAll('-', '.')} // ${all.length} TOTAL OPERATIONS`;
  elements.activeCount.textContent = `${all.length - completedCount} 项待执行`;
  elements.progressValue.textContent = `${progress}%`;
  elements.progressRing.style.setProperty('--progress', `${progress * 3.6}deg`);
  elements.showCompletedButton.textContent = state.showCompleted ? '隐藏已完成' : `显示已完成${completedCount ? ` (${completedCount})` : ''}`;
  elements.showCompletedButton.setAttribute('aria-pressed', String(state.showCompleted));

  if (!visible.length) {
    elements.taskList.innerHTML = `<div class="empty-state"><div><div class="empty-glyph">[ ]</div><strong>${all.length ? 'ACTIVE QUEUE CLEARED' : 'NO OPERATIONS FOUND'}</strong><span>${all.length ? '这一天的任务已经全部完成。' : '输入一项任务，启动今天的工作。'}</span></div></div>`;
    return;
  }

  elements.taskList.innerHTML = visible.map((task) => `
    <article class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <button class="check-button" data-action="toggle" type="button" aria-label="${task.completed ? '恢复' : '完成'}任务">✓</button>
      <div class="task-copy"><strong>${escapeHtml(task.title)}</strong><span>${task.completed ? `COMPLETED // ${formatTime(task.completedAt)}` : `CREATED // ${formatTime(task.createdAt)}`}</span></div>
      <div class="task-actions">
        <button data-action="edit" type="button" aria-label="编辑任务">✎</button>
        <button class="delete" data-action="delete" type="button" aria-label="删除任务">×</button>
      </div>
    </article>`).join('');
}

function formatTime(timestamp) {
  return timestamp ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp)) : '--:--';
}

function renderHistory() {
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const start = new Date(today); start.setDate(today.getDate() - 29); start.setHours(0, 0, 0, 0);
  const recent = state.tasks.filter((task) => {
    const date = fromDateKey(task.date);
    return date >= start && date <= today;
  });
  const completed = recent.filter((task) => task.completed);
  const groups = Object.groupBy ? Object.groupBy(completed, (task) => task.date) : completed.reduce((result, task) => {
    (result[task.date] ||= []).push(task); return result;
  }, {});
  const dates = Object.keys(groups).sort().reverse();
  elements.completedStat.textContent = completed.length;
  elements.activeDaysStat.textContent = dates.length;
  elements.completionStat.textContent = `${recent.length ? Math.round(completed.length / recent.length * 100) : 0}%`;
  elements.historyList.innerHTML = dates.length ? dates.map((key) => {
    const date = fromDateKey(key); const tasks = groups[key];
    return `<article class="history-day"><div class="history-date"><strong>${formatDate(date, { month: '2-digit', day: '2-digit' })}</strong><span>${formatDate(date, { weekday: 'short' })}</span></div><div class="history-tasks">${tasks.map((task) => `<span class="history-task">✓ ${escapeHtml(task.title)}</span>`).join('')}</div><span class="history-count">${tasks.length} DONE</span></article>`;
  }).join('') : '<div class="empty-state"><div><div class="empty-glyph">//</div><strong>ARCHIVE IS EMPTY</strong><span>完成的任务会出现在这里。</span></div></div>';
}

function render() { renderCalendar(); renderTasks(); renderHistory(); }

function selectDate(key) {
  state.selectedDate = key;
  state.calendarDate = startOfMonth(fromDateKey(key));
  state.showCompleted = false;
  render();
  if (innerWidth < 821) document.querySelector('.task-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addTask(title) {
  state.tasks.push({ id: uid(), title: title.trim(), date: state.selectedDate, completed: false, createdAt: Date.now(), completedAt: null });
  saveTasks(); render(); showToast('任务已写入队列');
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return;
  task.completed = !task.completed; task.completedAt = task.completed ? Date.now() : null;
  saveTasks(); render(); if (task.completed) showToast('任务完成，已转入档案');
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return;
  if (!confirm(`确定删除“${task.title}”吗？此操作无法撤销。`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== id); saveTasks(); render(); showToast('任务已删除');
}

function openEdit(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return;
  state.editingId = id; elements.editInput.value = task.title; elements.editDialog.showModal();
  requestAnimationFrame(() => elements.editInput.select());
}

function showToast(message) {
  elements.toast.textContent = message; elements.toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

elements.taskForm.addEventListener('submit', (event) => {
  event.preventDefault(); const title = elements.taskInput.value.trim(); if (!title) return;
  addTask(title); elements.taskInput.value = ''; elements.taskInput.focus();
});
elements.taskList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const id = button.closest('.task-item').dataset.id;
  if (button.dataset.action === 'toggle') toggleTask(id);
  if (button.dataset.action === 'edit') openEdit(id);
  if (button.dataset.action === 'delete') deleteTask(id);
});
elements.showCompletedButton.addEventListener('click', () => { state.showCompleted = !state.showCompleted; renderTasks(); });
document.querySelector('#previousMonth').addEventListener('click', () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1); renderCalendar(); });
document.querySelector('#nextMonth').addEventListener('click', () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1); renderCalendar(); });
document.querySelector('#todayButton').addEventListener('click', () => selectDate(toDateKey(new Date())));
document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); selectDate(toDateKey(new Date())); });
document.querySelector('#cancelEdit').addEventListener('click', () => elements.editDialog.close());
elements.editForm.addEventListener('submit', (event) => {
  event.preventDefault(); const title = elements.editInput.value.trim(); if (!title) return;
  const task = state.tasks.find((item) => item.id === state.editingId); if (task) task.title = title;
  saveTasks(); elements.editDialog.close(); render(); showToast('任务已更新');
});

render();
