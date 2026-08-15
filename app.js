const SUPABASE_URL = 'https://osgsjjqidodyjreslrbv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nS9Bu52AEVM2i8kYPnWb0A_yIT4p6XX';
const LEGACY_STORAGE_KEY = 'neon-log-tasks-v1';
const CACHE_PREFIX = 'neon-log-cloud-cache-';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const PRIORITIES = {
  normal: { label: '普通', weight: 0 }, important: { label: '重要', weight: 1 },
  urgent: { label: '紧急', weight: 2 }, critical: { label: '立即处理', weight: 3 },
};
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

const state = {
  tasks: [], user: null, selectedDate: toDateKey(new Date()), calendarDate: startOfMonth(new Date()),
  showCompleted: false, editingId: null, authMode: 'login',
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
  authGate: document.querySelector('#authGate'), authForm: document.querySelector('#authForm'),
  emailInput: document.querySelector('#emailInput'), passwordInput: document.querySelector('#passwordInput'),
  authSubmit: document.querySelector('#authSubmit'), authSwitch: document.querySelector('#authSwitch'),
  authTitle: document.querySelector('#authTitle'), authDescription: document.querySelector('#authDescription'),
  authMessage: document.querySelector('#authMessage'), accountButton: document.querySelector('#accountButton'),
  accountEmail: document.querySelector('#accountEmail'), systemStatus: document.querySelector('#systemStatus'),
  footerStatus: document.querySelector('#footerStatus'),
  reminderDialog: document.querySelector('#reminderDialog'), reminderForm: document.querySelector('#reminderForm'),
  reminderEmail: document.querySelector('#reminderEmail'), reminderEnabled: document.querySelector('#reminderEnabled'),
  reminderTime: document.querySelector('#reminderTime'), reminderTimezone: document.querySelector('#reminderTimezone'),
  reminderStatus: document.querySelector('#reminderStatus'), testEmailButton: document.querySelector('#testEmailButton'),
  signOutButton: document.querySelector('#signOutButton'), closeReminder: document.querySelector('#closeReminder'),
  createTimeScroll: document.querySelector('#createTimeScroll'), createPriorityPicker: document.querySelector('#createPriorityPicker'),
  editTimeScroll: document.querySelector('#editTimeScroll'), editPriorityPicker: document.querySelector('#editPriorityPicker'),
};

function toDateKey(date) {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function fromDateKey(key) { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day); }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function tasksForDate(key) { return state.tasks.filter((task) => task.date === key); }
function formatDate(date, options) { return new Intl.DateTimeFormat('zh-CN', options).format(date); }
function formatTime(timestamp) { return timestamp ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp)) : '--:--'; }
function cacheKey() { return `${CACHE_PREFIX}${state.user?.id || 'guest'}`; }

function setSyncStatus(status, message) {
  elements.systemStatus.className = `system-status ${status || ''}`;
  elements.systemStatus.innerHTML = `<i></i> ${message}`;
  elements.footerStatus.textContent = message;
}

function mapTask(row) {
  return {
    id: row.id, title: row.title, date: row.task_date, completed: row.completed,
    dueTime: row.due_time ? row.due_time.slice(0, 5) : null, priority: row.priority || 'normal',
    createdAt: new Date(row.created_at).getTime(), completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
  };
}

function loadCache() {
  try { const value = JSON.parse(localStorage.getItem(cacheKey())); return Array.isArray(value) ? value.map((task) => ({ ...task, dueTime: task.dueTime || null, priority: task.priority || 'normal' })) : []; }
  catch { return []; }
}
function saveCache() { if (state.user) localStorage.setItem(cacheKey(), JSON.stringify(state.tasks)); }

function renderTimePicker(container, selected = null) {
  const [hour = '09', rawMinute = '00'] = selected?.slice(0, 5).split(':') || [];
  const minute = MINUTE_OPTIONS.reduce((closest, value) => Math.abs(Number(value) - Number(rawMinute)) < Math.abs(Number(closest) - Number(rawMinute)) ? value : closest, '00');
  const column = (unit, label, options, value) => `<div class="wheel-group"><span>${label}</span><div class="wheel-column" data-unit="${unit}" role="listbox" aria-label="${label}"><i class="wheel-spacer"></i>${options.map((option, index) => `<button class="wheel-item${option === value ? ' selected' : ''}" data-value="${option}" data-index="${index}" type="button" role="option" aria-selected="${option === value}">${option}</button>`).join('')}<i class="wheel-spacer"></i></div></div>`;
  container.dataset.value = selected ? `${hour}:${minute}` : '';
  container.dataset.ready = 'false';
  container.innerHTML = `<div class="time-wheel-toolbar"><button class="no-deadline${selected ? '' : ' selected'}" data-action="clear-time" type="button">无截止时间</button><output>${selected ? `${hour}:${minute}` : '未设置'}</output></div><div class="wheel-stage"><div class="wheel-selection" aria-hidden="true"></div>${column('hour', '小时', HOUR_OPTIONS, hour)}<b>:</b>${column('minute', '分钟', MINUTE_OPTIONS, minute)}</div>`;
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
    items.forEach((option) => { const active = option === item; option.classList.toggle('selected', active); option.setAttribute('aria-selected', String(active)); });
  });
  const value = `${selected.hour || '00'}:${selected.minute || '00'}`;
  container.dataset.value = activate ? value : '';
  container.classList.toggle('has-time', activate);
  container.querySelector('.no-deadline')?.classList.toggle('selected', !activate);
  container.querySelector('output').textContent = activate ? value : '未设置';
}

function bindTimeWheel(container) {
  container.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear-time"]')) { updateTimeWheel(container, false); return; }
    const item = event.target.closest('.wheel-item'); if (!item) return;
    const wheel = item.closest('.wheel-column');
    wheel.scrollTo({ top: Number(item.dataset.index) * item.offsetHeight, behavior: 'smooth' });
  });
  container.addEventListener('scroll', (event) => {
    const wheel = event.target.closest?.('.wheel-column'); if (!wheel || container.dataset.ready !== 'true') return;
    clearTimeout(wheel._selectTimer);
    wheel._selectTimer = setTimeout(() => updateTimeWheel(container, true), 90);
  }, true);
}

function renderPriorityPicker(container, selected = 'normal') {
  container.dataset.value = selected;
  container.innerHTML = Object.entries(PRIORITIES).map(([value, meta]) => `<button class="priority-option${value === selected ? ' selected' : ''}" data-value="${value}" type="button" role="radio" aria-checked="${value === selected}">${meta.label}</button>`).join('');
}

function bindPicker(container) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]'); if (!button) return;
    container.dataset.value = button.dataset.value;
    container.querySelectorAll('button').forEach((item) => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-checked', String(selected)); });
    button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}

async function loadCloudTasks({ quiet = false } = {}) {
  if (!state.user) return;
  if (!quiet) setSyncStatus('syncing', 'SYNCING CLOUD DATA');
  const { data, error } = await supabaseClient.from('tasks').select('*').order('created_at', { ascending: false });
  if (error) {
    state.tasks = loadCache(); render(); setSyncStatus('error', 'SYNC FAILED — USING CACHE');
    if (!quiet) showToast(`同步失败：${error.message}`);
    return;
  }
  state.tasks = data.map(mapTask); saveCache(); render(); setSyncStatus('', 'CLOUD SYSTEM ONLINE');
}

async function migrateLegacyTasks() {
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || []; } catch {}
  if (!legacy.length || !state.user) return;
  setSyncStatus('syncing', 'MIGRATING LOCAL DATA');
  const rows = legacy.map((task) => ({
    user_id: state.user.id, title: task.title, task_date: task.date, completed: Boolean(task.completed),
    created_at: new Date(task.createdAt || Date.now()).toISOString(),
    completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
  }));
  const { error } = await supabaseClient.from('tasks').insert(rows);
  if (error) { showToast(`本地任务迁移失败：${error.message}`); return; }
  localStorage.removeItem(LEGACY_STORAGE_KEY); showToast(`已迁移 ${legacy.length} 项本地任务到云端`);
}

function renderCalendar() {
  const view = state.calendarDate;
  elements.calendarMonth.textContent = `${view.getMonth() + 1} 月`;
  elements.calendarYear.textContent = `${view.getFullYear()} // CALENDAR`;
  elements.calendarGrid.innerHTML = '';
  const firstWeekday = (view.getDay() + 6) % 7;
  const firstCell = new Date(view.getFullYear(), view.getMonth(), 1 - firstWeekday);
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstCell); date.setDate(firstCell.getDate() + index);
    const key = toDateKey(date), dailyTasks = tasksForDate(key), button = document.createElement('button');
    button.type = 'button'; button.className = 'calendar-day';
    if (!sameMonth(date, view)) button.classList.add('outside');
    if (key === toDateKey(new Date())) button.classList.add('today');
    if (key === state.selectedDate) button.classList.add('selected');
    if (dailyTasks.length && dailyTasks.every((task) => task.completed)) button.classList.add('all-done');
    button.innerHTML = `<span>${date.getDate()}</span>${dailyTasks.length ? '<i class="day-dot"></i>' : ''}`;
    button.setAttribute('aria-label', `${formatDate(date, { month: 'long', day: 'numeric' })}，${dailyTasks.length} 项任务`);
    button.addEventListener('click', () => selectDate(key)); elements.calendarGrid.appendChild(button);
  }
}

function renderTasks() {
  const selected = fromDateKey(state.selectedDate);
  const all = tasksForDate(state.selectedDate).sort((a, b) => {
    const priorityDifference = PRIORITIES[b.priority].weight - PRIORITIES[a.priority].weight;
    if (priorityDifference) return priorityDifference;
    if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
    if (a.dueTime) return -1; if (b.dueTime) return 1;
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
  elements.showCompletedButton.textContent = state.showCompleted ? '隐藏已完成' : `显示已完成${completedCount ? ` (${completedCount})` : ''}`;
  elements.showCompletedButton.setAttribute('aria-pressed', String(state.showCompleted));
  if (!visible.length) {
    elements.taskList.innerHTML = `<div class="empty-state"><div><div class="empty-glyph">[ ]</div><strong>${all.length ? 'ACTIVE QUEUE CLEARED' : 'NO OPERATIONS FOUND'}</strong><span>${all.length ? '这一天的任务已经全部完成。' : '输入一项任务，启动今天的工作。'}</span></div></div>`;
    return;
  }
  elements.taskList.innerHTML = visible.map((task) => `
    <article class="task-item priority-${task.priority} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <button class="check-button" data-action="toggle" type="button" aria-label="${task.completed ? '恢复' : '完成'}任务">✓</button>
      <div class="task-copy"><strong>${escapeHtml(task.title)}</strong><span>${task.completed ? `COMPLETED // ${formatTime(task.completedAt)}` : `CREATED // ${formatTime(task.createdAt)}`}</span><div class="task-meta">${task.dueTime ? `<span class="due-chip">⏱ ${task.dueTime}</span>` : ''}<span class="priority-chip ${task.priority}">${PRIORITIES[task.priority].label}</span></div></div>
      <div class="task-actions"><button data-action="edit" type="button" aria-label="编辑任务">✎</button><button class="delete" data-action="delete" type="button" aria-label="删除任务">×</button></div>
    </article>`).join('');
}

function renderHistory() {
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const start = new Date(today); start.setDate(today.getDate() - 29); start.setHours(0, 0, 0, 0);
  const recent = state.tasks.filter((task) => { const date = fromDateKey(task.date); return date >= start && date <= today; });
  const completed = recent.filter((task) => task.completed);
  const groups = completed.reduce((result, task) => { (result[task.date] ||= []).push(task); return result; }, {});
  const dates = Object.keys(groups).sort().reverse();
  elements.completedStat.textContent = completed.length; elements.activeDaysStat.textContent = dates.length;
  elements.completionStat.textContent = `${recent.length ? Math.round(completed.length / recent.length * 100) : 0}%`;
  elements.historyList.innerHTML = dates.length ? dates.map((key) => {
    const date = fromDateKey(key), tasks = groups[key];
    return `<article class="history-day"><div class="history-date"><strong>${formatDate(date, { month: '2-digit', day: '2-digit' })}</strong><span>${formatDate(date, { weekday: 'short' })}</span></div><div class="history-tasks">${tasks.map((task) => `<span class="history-task">✓ ${escapeHtml(task.title)}${task.dueTime ? ` · ${task.dueTime}` : ''} · ${PRIORITIES[task.priority].label}</span>`).join('')}</div><span class="history-count">${tasks.length} DONE</span></article>`;
  }).join('') : '<div class="empty-state"><div><div class="empty-glyph">//</div><strong>ARCHIVE IS EMPTY</strong><span>完成的任务会出现在这里。</span></div></div>';
}

function render() { renderCalendar(); renderTasks(); renderHistory(); }
function selectDate(key) {
  state.selectedDate = key; state.calendarDate = startOfMonth(fromDateKey(key)); state.showCompleted = false; render();
  if (innerWidth < 821) document.querySelector('.task-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function addTask(title, dueTime, priority) {
  setSyncStatus('syncing', 'WRITING TO CLOUD');
  const { data, error } = await supabaseClient.from('tasks').insert({ user_id: state.user.id, title: title.trim(), task_date: state.selectedDate, due_time: dueTime || null, priority }).select().single();
  if (error) { setSyncStatus('error', 'SYNC FAILED'); showToast(`添加失败：${error.message}`); return false; }
  state.tasks.unshift(mapTask(data)); saveCache(); render(); setSyncStatus('', 'CLOUD SYSTEM ONLINE'); showToast('任务已同步到云端'); return true;
}

async function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return;
  const nextCompleted = !task.completed, completedAt = nextCompleted ? new Date().toISOString() : null;
  const { data, error } = await supabaseClient.from('tasks').update({ completed: nextCompleted, completed_at: completedAt, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) { showToast(`更新失败：${error.message}`); return; }
  Object.assign(task, mapTask(data)); saveCache(); render(); if (task.completed) showToast('任务完成，已同步到档案');
}

async function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !confirm(`确定删除“${task.title}”吗？此操作无法撤销。`)) return;
  const { error } = await supabaseClient.from('tasks').delete().eq('id', id);
  if (error) { showToast(`删除失败：${error.message}`); return; }
  state.tasks = state.tasks.filter((item) => item.id !== id); saveCache(); render(); showToast('任务已从云端删除');
}

function openEdit(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return;
  state.editingId = id; elements.editInput.value = task.title;
  elements.editDialog.showModal(); renderTimePicker(elements.editTimeScroll, task.dueTime); renderPriorityPicker(elements.editPriorityPicker, task.priority);
  requestAnimationFrame(() => elements.editInput.select());
}
function showToast(message) {
  elements.toast.textContent = message; elements.toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

async function openReminderSettings() {
  if (!state.user) return;
  elements.reminderEmail.value = state.user.email || '';
  elements.reminderEnabled.checked = false; elements.reminderTime.value = '09:00'; elements.reminderTimezone.value = 'Asia/Shanghai';
  elements.reminderStatus.textContent = '正在读取云端设置...'; elements.reminderDialog.showModal();
  const { data, error } = await supabaseClient.from('reminder_settings').select('*').eq('user_id', state.user.id).maybeSingle();
  if (error) { elements.reminderStatus.textContent = `读取失败：${error.message}`; return; }
  if (!data) { elements.reminderStatus.textContent = '尚未配置。保存后定时任务会自动生效。'; return; }
  elements.reminderEnabled.checked = data.enabled;
  elements.reminderTime.value = data.reminder_time.slice(0, 5);
  elements.reminderTimezone.value = data.timezone;
  elements.reminderStatus.textContent = data.last_sent_on ? `上次发送日期：${data.last_sent_on}` : '尚未发送过每日提醒';
}

async function saveReminderSettings(showSuccess = true) {
  if (!state.user) return false;
  const payload = {
    user_id: state.user.id, email: state.user.email, enabled: elements.reminderEnabled.checked,
    reminder_time: `${elements.reminderTime.value}:00`, timezone: elements.reminderTimezone.value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from('reminder_settings').upsert(payload, { onConflict: 'user_id' });
  if (error) { elements.reminderStatus.textContent = `保存失败：${error.message}`; return false; }
  elements.reminderStatus.textContent = payload.enabled
    ? `已启用：每天 ${elements.reminderTime.value}（${elements.reminderTimezone.selectedOptions[0].textContent}）`
    : '每日邮件提醒已关闭';
  if (showSuccess) showToast('邮件提醒设置已保存');
  return true;
}

async function sendTestEmail() {
  elements.testEmailButton.disabled = true; elements.reminderStatus.textContent = '正在生成并发送测试邮件...';
  if (!await saveReminderSettings(false)) { elements.testEmailButton.disabled = false; return; }
  const { data, error } = await supabaseClient.functions.invoke('send-task-reminders', { body: { test: true } });
  elements.testEmailButton.disabled = false;
  const result = data?.results?.[0];
  if (error || !data?.ok || result?.status !== 'sent') {
    const detail = result?.detail || error?.message || data?.error || '未知错误';
    elements.reminderStatus.textContent = `测试邮件发送失败：${detail}`; return;
  }
  elements.reminderStatus.textContent = `测试邮件已发送至 ${state.user.email}`; showToast('测试邮件发送成功');
}

function updateAuthUI() {
  const registering = state.authMode === 'register';
  elements.authTitle.textContent = registering ? '创建云端身份' : '连接你的工作档案';
  elements.authDescription.textContent = registering ? '注册后请在邮箱中确认账号，再返回这里登录。' : '登录后，任务将在电脑和手机之间同步。';
  elements.authSubmit.textContent = registering ? '创建云端账号' : '登录云端终端';
  elements.authSwitch.textContent = registering ? '已有账号？返回登录' : '还没有账号？创建账号';
  elements.passwordInput.autocomplete = registering ? 'new-password' : 'current-password'; elements.authMessage.textContent = '';
}

async function handleSession(session) {
  state.user = session?.user || null;
  elements.authGate.hidden = Boolean(state.user); elements.accountButton.hidden = !state.user;
  if (!state.user) { state.tasks = []; setSyncStatus('', 'CLOUD LINK STANDBY'); render(); return; }
  elements.accountEmail.textContent = state.user.email; await migrateLegacyTasks(); await loadCloudTasks();
}

elements.authForm.addEventListener('submit', async (event) => {
  event.preventDefault(); elements.authSubmit.disabled = true; elements.authMessage.textContent = '正在建立安全连接...';
  const email = elements.emailInput.value.trim(), password = elements.passwordInput.value;
  const result = state.authMode === 'register'
    ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}${location.pathname}` } })
    : await supabaseClient.auth.signInWithPassword({ email, password });
  elements.authSubmit.disabled = false;
  if (result.error) { elements.authMessage.textContent = `错误：${result.error.message}`; return; }
  if (state.authMode === 'register' && !result.data.session) elements.authMessage.textContent = '注册成功，请检查邮箱并点击确认链接。';
});
elements.authSwitch.addEventListener('click', () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; updateAuthUI(); });
elements.accountButton.addEventListener('click', openReminderSettings);
elements.closeReminder.addEventListener('click', () => elements.reminderDialog.close());
elements.reminderForm.addEventListener('submit', async (event) => { event.preventDefault(); if (await saveReminderSettings()) elements.reminderDialog.close(); });
elements.testEmailButton.addEventListener('click', sendTestEmail);
elements.signOutButton.addEventListener('click', async () => { elements.reminderDialog.close(); await supabaseClient.auth.signOut(); showToast('已安全退出云端终端'); });
elements.taskForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const title = elements.taskInput.value.trim(); if (!title || !state.user) return;
  elements.taskInput.disabled = true;
  if (await addTask(title, elements.createTimeScroll.dataset.value, elements.createPriorityPicker.dataset.value)) {
    elements.taskInput.value = ''; renderTimePicker(elements.createTimeScroll); renderPriorityPicker(elements.createPriorityPicker);
  }
  elements.taskInput.disabled = false; elements.taskInput.focus();
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
elements.editForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const title = elements.editInput.value.trim(); if (!title) return;
  const { data, error } = await supabaseClient.from('tasks').update({ title, due_time: elements.editTimeScroll.dataset.value || null, priority: elements.editPriorityPicker.dataset.value, updated_at: new Date().toISOString() }).eq('id', state.editingId).select().single();
  if (error) { showToast(`修改失败：${error.message}`); return; }
  const index = state.tasks.findIndex((task) => task.id === state.editingId); if (index >= 0) state.tasks[index] = mapTask(data);
  saveCache(); elements.editDialog.close(); render(); showToast('修改已同步');
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) loadCloudTasks({ quiet: true }); });
supabaseClient.auth.onAuthStateChange((_event, session) => { setTimeout(() => handleSession(session), 0); });
bindTimeWheel(elements.createTimeScroll); bindPicker(elements.createPriorityPicker); bindTimeWheel(elements.editTimeScroll); bindPicker(elements.editPriorityPicker);
renderTimePicker(elements.createTimeScroll); renderPriorityPicker(elements.createPriorityPicker);
updateAuthUI(); render();
