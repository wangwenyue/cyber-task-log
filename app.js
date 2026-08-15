const STORAGE_KEY = 'neon-log-local-tasks';
const LEGACY_STORAGE_KEY = 'neon-log-tasks-v1';
const CACHE_PREFIX = 'neon-log-cloud-cache-';
const THEME_STORAGE_KEY = 'neon-log-theme';
const REMINDER_STORAGE_KEY = 'neon-log-reminder-enabled';
const REMINDER_SENT_KEY = 'neon-log-reminder-sent';
const REMINDER_CHECK_INTERVAL = 15000;

let reminderTimer = null;

const PRIORITIES = {
  normal: { label: '普通', weight: 0 },
  important: { label: '重要', weight: 1 },
  urgent: { label: '紧急', weight: 2 },
  critical: { label: '立即处理', weight: 3 },
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

const state = {
  tasks: [],
  selectedDate: toDateKey(new Date()),
  calendarDate: startOfMonth(new Date()),
  showCompleted: false,
  editingId: null,
  reminderEnabled: false,
};

const elements = {
  calendarMonth: document.querySelector('#calendarMonth'),
  calendarYear: document.querySelector('#calendarYear'),
  calendarGrid: document.querySelector('#calendarGrid'),
  selectedDateTitle: document.querySelector('#selectedDateTitle'),
  selectedDateMeta: document.querySelector('#selectedDateMeta'),
  taskForm: document.querySelector('#taskForm'),
  taskInput: document.querySelector('#taskInput'),
  taskList: document.querySelector('#taskList'),
  activeCount: document.querySelector('#activeCount'),
  progressRing: document.querySelector('#progressRing'),
  progressValue: document.querySelector('#progressValue'),
  showCompletedButton: document.querySelector('#showCompletedButton'),
  historyList: document.querySelector('#historyList'),
  completedStat: document.querySelector('#completedStat'),
  activeDaysStat: document.querySelector('#activeDaysStat'),
  completionStat: document.querySelector('#completionStat'),
  editDialog: document.querySelector('#editDialog'),
  editForm: document.querySelector('#editForm'),
  editInput: document.querySelector('#editInput'),
  toast: document.querySelector('#toast'),
  systemStatus: document.querySelector('#systemStatus'),
  footerStatus: document.querySelector('#footerStatus'),
  themeToggle: document.querySelector('#themeToggle'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  notificationButton: document.querySelector('#notificationButton'),
  reminderDialog: document.querySelector('#reminderDialog'),
  reminderForm: document.querySelector('#reminderForm'),
  reminderEnabled: document.querySelector('#reminderEnabled'),
  reminderStatus: document.querySelector('#reminderStatus'),
  closeReminder: document.querySelector('#closeReminder'),
  closeReminderTop: document.querySelector('#closeReminderTop'),
  createTimeScroll: document.querySelector('#createTimeScroll'),
  createPriorityPicker: document.querySelector('#createPriorityPicker'),
  editTimeScroll: document.querySelector('#editTimeScroll'),
  editPriorityPicker: document.querySelector('#editPriorityPicker'),
};

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

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function tasksForDate(key) {
  return state.tasks.filter((task) => task.date === key);
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

function formatTime(timestamp) {
  return timestamp
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))
    : '--:--';
}

function createLocalId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTask(task) {
  return {
    id: task.id || createLocalId(),
    title: String(task.title || ''),
    date: task.date || toDateKey(new Date()),
    completed: Boolean(task.completed),
    dueTime: task.dueTime || null,
    priority: PRIORITIES[task.priority] ? task.priority : 'normal',
    createdAt: Number(task.createdAt) || Date.now(),
    completedAt: task.completedAt ? Number(task.completedAt) : null,
  };
}

function readTasksFromKey(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

function mergeTasks(groups) {
  const byId = new Map();
  groups.flat().forEach((task) => {
    if (!byId.has(task.id)) byId.set(task.id, task);
  });
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function loadLocalTasks() {
  const current = readTasksFromKey(STORAGE_KEY);
  let legacyKeys = [];
  try {
    legacyKeys = [LEGACY_STORAGE_KEY, ...Object.keys(localStorage).filter((key) => key.startsWith(CACHE_PREFIX))];
  } catch {}

  const migrated = legacyKeys.flatMap((key) => readTasksFromKey(key));
  if (!current.length && !migrated.length) return [];

  const tasks = mergeTasks([current, migrated]);
  saveTasks(tasks);
  legacyKeys.forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
  return tasks;
}

function saveTasks(tasks = state.tasks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
}

function applyTheme(theme) {
  const selected = theme === 'minimal' ? 'minimal' : 'cyber';
  document.documentElement.dataset.theme = selected;
  elements.themeToggle.querySelector('span').textContent = selected === 'cyber' ? '2077' : '山水';
  elements.themeToggle.setAttribute('aria-pressed', String(selected === 'minimal'));
  elements.themeToggle.title = selected === 'cyber'
    ? '当前：赛博朋克 2077，点击切换山水主题'
    : '当前：云雾山水，点击切换赛博朋克主题';
  elements.themeColor.content = selected === 'cyber' ? '#10141b' : '#eee9dd';
  try { localStorage.setItem(THEME_STORAGE_KEY, selected); } catch {}
}

function setLocalStatus(message) {
  elements.systemStatus.className = 'system-status';
  elements.systemStatus.innerHTML = `<i></i> ${message}`;
  elements.footerStatus.textContent = message;
}

function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function loadReminderEnabled() {
  try { return localStorage.getItem(REMINDER_STORAGE_KEY) === 'true'; } catch { return false; }
}

function saveReminderEnabled(enabled) {
  try { localStorage.setItem(REMINDER_STORAGE_KEY, String(enabled)); } catch {}
}

function loadReminderSent() {
  try {
    const value = JSON.parse(localStorage.getItem(REMINDER_SENT_KEY));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveReminderSent(sent) {
  try { localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(sent)); } catch {}
}

function updateReminderUI() {
  const supported = notificationSupported();
  const permission = supported ? Notification.permission : 'unsupported';
  const active = state.reminderEnabled && supported && permission === 'granted';
  elements.reminderEnabled.checked = active;
  elements.notificationButton.classList.toggle('active', active);
  elements.notificationButton.setAttribute('aria-pressed', String(active));
  elements.notificationButton.title = active ? '桌面提醒已开启' : '开启桌面提醒';

  if (!supported) {
    elements.reminderStatus.textContent = '当前浏览器不支持系统通知，请使用现代浏览器，并通过 localhost 或 https 打开页面。';
  } else if (permission === 'denied') {
    elements.reminderStatus.textContent = '通知权限已被拒绝。请在浏览器地址栏的站点设置中允许通知后重试。';
  } else if (active) {
    elements.reminderStatus.textContent = '已开启：页面保持打开时，任务到达截止时间会发送桌面通知。';
  } else if (permission === 'default') {
    elements.reminderStatus.textContent = '尚未开启。打开开关后会请求系统通知权限。';
  } else {
    elements.reminderStatus.textContent = '尚未开启。';
  }
}

async function enableDesktopReminders() {
  if (!notificationSupported()) {
    elements.reminderEnabled.checked = false;
    updateReminderUI();
    return false;
  }

  let permission = Notification.permission;
  try {
    if (permission === 'default') permission = await Notification.requestPermission();
  } catch {
    permission = 'denied';
  }

  if (permission !== 'granted') {
    state.reminderEnabled = false;
    saveReminderEnabled(false);
    syncReminderTimer();
    updateReminderUI();
    showToast('未获得通知权限，桌面提醒未开启');
    return false;
  }

  state.reminderEnabled = true;
  saveReminderEnabled(true);
  syncReminderTimer();
  updateReminderUI();
  showToast('桌面提醒已开启');
  return true;
}

function disableDesktopReminders() {
  state.reminderEnabled = false;
  saveReminderEnabled(false);
  syncReminderTimer();
  updateReminderUI();
  showToast('桌面提醒已关闭');
}

function openReminderSettings() {
  updateReminderUI();
  elements.reminderDialog.showModal();
}

function closeReminderSettings() {
  elements.reminderDialog.close();
}

function syncReminderTimer() {
  clearInterval(reminderTimer);
  reminderTimer = null;
  if (!state.reminderEnabled || !notificationSupported() || Notification.permission !== 'granted') return;
  checkDueReminders();
  reminderTimer = setInterval(checkDueReminders, REMINDER_CHECK_INTERVAL);
}

function sendTaskReminder(task, overdue = false) {
  const title = overdue ? `任务已到截止时间 ${task.dueTime}` : `任务提醒 ${task.dueTime}`;
  if (notificationSupported() && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: task.title,
      tag: `${task.id}-${task.date}-${task.dueTime}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      selectDate(task.date);
      notification.close();
    };
    setTimeout(() => notification.close(), 20000);
    return;
  }
  showToast(`${title}：${task.title}`);
}

function checkDueReminders() {
  if (!state.reminderEnabled || !notificationSupported() || Notification.permission !== 'granted' || !state.tasks.length) return;
  const now = new Date();
  const todayKey = toDateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sent = loadReminderSent();
  let changed = false;

  state.tasks.forEach((task) => {
    if (!task.dueTime || task.completed || task.date !== todayKey) return;
    const [hour, minute] = task.dueTime.split(':').map(Number);
    const dueMinutes = hour * 60 + minute;
    const difference = currentMinutes - dueMinutes;
    if (difference < 0 || difference > 1) return;
    const sentKey = `${task.id}:${task.date}:${task.dueTime}`;
    if (sent[sentKey]) return;
    sendTaskReminder(task, difference > 0);
    sent[sentKey] = Date.now();
    changed = true;
  });

  if (changed) saveReminderSent(sent);
}

function renderTimePicker(container, selected = null) {
  const [hour = '09', rawMinute = '00'] = selected?.slice(0, 5).split(':') || [];
  const minute = MINUTE_OPTIONS.reduce(
    (closest, value) => Math.abs(Number(value) - Number(rawMinute)) < Math.abs(Number(closest) - Number(rawMinute)) ? value : closest,
    '00',
  );
  const column = (unit, label, options, value) => `
    <div class="wheel-group">
      <span>${label}</span>
      <div class="wheel-column" data-unit="${unit}" role="listbox" aria-label="${label}">
        <i class="wheel-spacer"></i>
        ${options.map((option, index) => `<button class="wheel-item${option === value ? ' selected' : ''}" data-value="${option}" data-index="${index}" type="button" role="option" aria-selected="${option === value}">${option}</button>`).join('')}
        <i class="wheel-spacer"></i>
      </div>
    </div>`;

  container.dataset.value = selected ? `${hour}:${minute}` : '';
  container.dataset.ready = 'false';
  container.innerHTML = `
    <div class="time-wheel-toolbar">
      <button class="no-deadline${selected ? '' : ' selected'}" data-action="clear-time" type="button">无截止时间</button>
      <output>${selected ? `${hour}:${minute}` : '未设置'}</output>
    </div>
    <div class="wheel-stage">
      <div class="wheel-selection" aria-hidden="true"></div>
      ${column('hour', '小时', HOUR_OPTIONS, hour)}
      <b>:</b>
      ${column('minute', '分钟', MINUTE_OPTIONS, minute)}
    </div>`;
  container.classList.toggle('has-time', Boolean(selected));

  requestAnimationFrame(() => {
    container.querySelectorAll('.wheel-column').forEach((wheel) => {
      const target = wheel.querySelector('.wheel-item.selected');
      wheel.scrollTop = Number(target?.dataset.index || 0) * (target?.offsetHeight || 46);
    });
    setTimeout(() => { container.dataset.ready = 'true'; }, 140);
  });
}

function updateTimeWheel(container, activate = true) {
  const selected = {};
  container.querySelectorAll('.wheel-column').forEach((wheel) => {
    const items = [...wheel.querySelectorAll('.wheel-item')];
    const height = items[0]?.offsetHeight || 46;
    const item = items[Math.max(0, Math.min(items.length - 1, Math.round(wheel.scrollTop / height)))];
    selected[wheel.dataset.unit] = item?.dataset.value || '00';
    items.forEach((option) => {
      const active = option === item;
      option.classList.toggle('selected', active);
      option.setAttribute('aria-selected', String(active));
    });
  });
  const value = `${selected.hour || '00'}:${selected.minute || '00'}`;
  container.dataset.value = activate ? value : '';
  container.classList.toggle('has-time', activate);
  container.querySelector('.no-deadline')?.classList.toggle('selected', !activate);
  container.querySelector('output').textContent = activate ? value : '未设置';
}

function bindTimeWheel(container) {
  container.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear-time"]')) {
      updateTimeWheel(container, false);
      return;
    }
    const item = event.target.closest('.wheel-item');
    if (!item) return;
    const wheel = item.closest('.wheel-column');
    wheel.scrollTo({ top: Number(item.dataset.index) * item.offsetHeight, behavior: 'smooth' });
  });
  container.addEventListener('scroll', (event) => {
    const wheel = event.target.closest?.('.wheel-column');
    if (!wheel || container.dataset.ready !== 'true') return;
    clearTimeout(wheel._selectTimer);
    wheel._selectTimer = setTimeout(() => updateTimeWheel(container, true), 90);
  }, true);
}

function renderPriorityPicker(container, selected = 'normal') {
  container.dataset.value = selected;
  container.innerHTML = Object.entries(PRIORITIES)
    .map(([value, meta]) => `<button class="priority-option${value === selected ? ' selected' : ''}" data-value="${value}" type="button" role="radio" aria-checked="${value === selected}">${meta.label}</button>`)
    .join('');
}

function bindPicker(container) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    container.dataset.value = button.dataset.value;
    container.querySelectorAll('button').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', String(selected));
    });
    button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
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
  const all = tasksForDate(state.selectedDate).sort((a, b) => {
    const priorityDifference = PRIORITIES[b.priority].weight - PRIORITIES[a.priority].weight;
    if (priorityDifference) return priorityDifference;
    if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
    if (a.dueTime) return -1;
    if (b.dueTime) return 1;
    return b.createdAt - a.createdAt;
  });
  const visible = state.showCompleted ? all : all.filter((task) => !task.completed);
  const completedCount = all.filter((task) => task.completed).length;
  const progress = all.length ? Math.round(completedCount / all.length * 100) : 0;
  elements.selectedDateTitle.textContent = formatDate(selected, { month: 'long', day: 'numeric', weekday: 'long' });
  elements.selectedDateMeta.textContent = `${state.selectedDate.replaceAll('-', '.')} // ${all.length} TOTAL OPERATIONS`;
  elements.activeCount.textContent = `${all.length - completedCount} 项待执行`;
  elements.progressValue.textContent = `${progress}%`;
  elements.progressRing.style.setProperty('--progress', `${progress * 3.6}deg`);
  elements.showCompletedButton.textContent = state.showCompleted
    ? '隐藏已完成'
    : `显示已完成${completedCount ? ` (${completedCount})` : ''}`;
  elements.showCompletedButton.setAttribute('aria-pressed', String(state.showCompleted));

  if (!visible.length) {
    elements.taskList.innerHTML = `
      <div class="empty-state">
        <div>
          <div class="empty-glyph">[ ]</div>
          <strong>${all.length ? 'ACTIVE QUEUE CLEARED' : 'NO OPERATIONS FOUND'}</strong>
          <span>${all.length ? '这一天的任务已经全部完成。' : '输入一项任务，启动今天的工作。'}</span>
        </div>
      </div>`;
    return;
  }

  elements.taskList.innerHTML = visible.map((task) => `
    <article class="task-item priority-${task.priority} ${task.completed ? 'completed' : ''}" data-id="${task.id}" role="button" tabindex="0" aria-label="点击修改任务">
      <button class="check-button" data-action="toggle" type="button" aria-label="${task.completed ? '恢复' : '完成'}任务">✓</button>
      <div class="task-copy">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${task.completed ? `COMPLETED // ${formatTime(task.completedAt)}` : `CREATED // ${formatTime(task.createdAt)}`}</span>
        <div class="task-meta">
          ${task.dueTime ? `<span class="due-chip">⏱ ${task.dueTime}</span>` : ''}
          <span class="priority-chip ${task.priority}">${PRIORITIES[task.priority].label}</span>
        </div>
      </div>
      <div class="task-actions"><button class="delete" data-action="delete" type="button" aria-label="删除任务">×</button></div>
    </article>`).join('');
}

function renderHistory() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const recent = state.tasks.filter((task) => {
    const date = fromDateKey(task.date);
    return date >= start && date <= today;
  });
  const completed = recent.filter((task) => task.completed);
  const groups = completed.reduce((result, task) => {
    (result[task.date] ||= []).push(task);
    return result;
  }, {});
  const dates = Object.keys(groups).sort().reverse();
  elements.completedStat.textContent = completed.length;
  elements.activeDaysStat.textContent = dates.length;
  elements.completionStat.textContent = `${recent.length ? Math.round(completed.length / recent.length * 100) : 0}%`;
  elements.historyList.innerHTML = dates.length
    ? dates.map((key) => {
      const date = fromDateKey(key);
      const tasks = groups[key];
      return `
        <article class="history-day">
          <div class="history-date">
            <strong>${formatDate(date, { month: '2-digit', day: '2-digit' })}</strong>
            <span>${formatDate(date, { weekday: 'short' })}</span>
          </div>
          <div class="history-tasks">${tasks.map((task) => `<span class="history-task">✓ ${escapeHtml(task.title)}${task.dueTime ? ` · ${task.dueTime}` : ''} · ${PRIORITIES[task.priority].label}</span>`).join('')}</div>
          <span class="history-count">${tasks.length} DONE</span>
        </article>`;
    }).join('')
    : '<div class="empty-state"><div><div class="empty-glyph">//</div><strong>ARCHIVE IS EMPTY</strong><span>完成的任务会出现在这里。</span></div></div>';
}

function render() {
  renderCalendar();
  renderTasks();
  renderHistory();
}

function selectDate(key) {
  state.selectedDate = key;
  state.calendarDate = startOfMonth(fromDateKey(key));
  state.showCompleted = false;
  render();
  if (innerWidth < 821) document.querySelector('.task-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addTask(title, dueTime, priority) {
  state.tasks.unshift({
    id: createLocalId(),
    title: title.trim(),
    date: state.selectedDate,
    completed: false,
    dueTime: dueTime || null,
    priority,
    createdAt: Date.now(),
    completedAt: null,
  });
  saveTasks();
  syncReminderTimer();
  render();
  showToast('任务已保存到本地');
  return true;
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completedAt = task.completed ? Date.now() : null;
  saveTasks();
  syncReminderTimer();
  render();
  showToast(task.completed ? '任务完成，已保存到本地' : '任务已恢复，保存在本地');
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !confirm(`确定删除“${task.title}”吗？此操作无法撤销。`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  saveTasks();
  syncReminderTimer();
  render();
  showToast('任务已从本地删除');
}

function openEdit(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  state.editingId = id;
  elements.editInput.value = task.title;
  elements.editDialog.showModal();
  renderTimePicker(elements.editTimeScroll, task.dueTime);
  renderPriorityPicker(elements.editPriorityPicker, task.priority);
  requestAnimationFrame(() => elements.editInput.select());
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

elements.taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = elements.taskInput.value.trim();
  if (!title) return;
  if (addTask(title, elements.createTimeScroll.dataset.value, elements.createPriorityPicker.dataset.value)) {
    elements.taskInput.value = '';
    renderTimePicker(elements.createTimeScroll);
    renderPriorityPicker(elements.createPriorityPicker);
  }
  elements.taskInput.focus();
});

elements.taskList.addEventListener('click', (event) => {
  const item = event.target.closest('.task-item');
  if (!item) return;
  const button = event.target.closest('button[data-action]');
  if (button?.dataset.action === 'toggle') {
    toggleTask(item.dataset.id);
    return;
  }
  if (button?.dataset.action === 'delete') {
    deleteTask(item.dataset.id);
    return;
  }
  openEdit(item.dataset.id);
});

elements.taskList.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
  const item = event.target.closest('.task-item');
  if (!item) return;
  event.preventDefault();
  openEdit(item.dataset.id);
});

elements.showCompletedButton.addEventListener('click', () => {
  state.showCompleted = !state.showCompleted;
  renderTasks();
});

document.querySelector('#previousMonth').addEventListener('click', () => {
  state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
  renderCalendar();
});

document.querySelector('#nextMonth').addEventListener('click', () => {
  state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
  renderCalendar();
});

document.querySelector('#todayButton').addEventListener('click', () => selectDate(toDateKey(new Date())));
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  selectDate(toDateKey(new Date()));
});
document.querySelector('#cancelEdit').addEventListener('click', () => elements.editDialog.close());
elements.themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'cyber' ? 'minimal' : 'cyber');
});
elements.notificationButton.addEventListener('click', openReminderSettings);
elements.closeReminder.addEventListener('click', closeReminderSettings);
elements.closeReminderTop.addEventListener('click', closeReminderSettings);
elements.reminderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  closeReminderSettings();
});
elements.reminderEnabled.addEventListener('change', (event) => {
  if (event.target.checked) enableDesktopReminders();
  else disableDesktopReminders();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDueReminders();
});

elements.editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = elements.editInput.value.trim();
  if (!title) return;
  const dueTime = elements.editTimeScroll.dataset.value || null;
  const priority = elements.editPriorityPicker.dataset.value;
  const index = state.tasks.findIndex((task) => task.id === state.editingId);
  if (index >= 0) state.tasks[index] = { ...state.tasks[index], title, dueTime, priority };
  saveTasks();
  syncReminderTimer();
  elements.editDialog.close();
  render();
  showToast('修改已保存到本地');
});

bindTimeWheel(elements.createTimeScroll);
bindPicker(elements.createPriorityPicker);
bindTimeWheel(elements.editTimeScroll);
bindPicker(elements.editPriorityPicker);
renderTimePicker(elements.createTimeScroll);
renderPriorityPicker(elements.createPriorityPicker);
applyTheme(document.documentElement.dataset.theme);
state.tasks = loadLocalTasks();
state.reminderEnabled = loadReminderEnabled();
syncReminderTimer();
updateReminderUI();
setLocalStatus('LOCAL STORAGE ONLINE');
render();
