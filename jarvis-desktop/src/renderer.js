const $ = (id) => document.getElementById(id);
const state = { settings: null, messages: [], notes: [], tasks: [], activity: [], view: 'dashboard', busy: false, toastTimer: null };

function notify(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function timeLabel(value) {
  try { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; }
}
function dateLabel(value) {
  try { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value)); } catch { return ''; }
}
function setView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === name));
  const titles = { dashboard: ['ЦЕНТР УПРАВЛЕНИЯ', 'Обзор системы'], chat: ['ИНТЕЛЛЕКТУАЛЬНЫЙ ИНТЕРФЕЙС', 'Диалог с JARVIS'], apps: ['ИНСТРУМЕНТЫ', 'Приложения'], notes: ['ЛИЧНАЯ ОРГАНИЗАЦИЯ', 'Заметки и задачи'], settings: ['ПАРАМЕТРЫ СИСТЕМЫ', 'Настройки'] };
  $('pageEyebrow').textContent = titles[name][0]; $('pageTitle').textContent = titles[name][1];
  if (name === 'chat') $('chatInput').focus();
}
function renderSystem(info) {
  $('platformStat').textContent = info.platformName;
  $('platformSub').textContent = `${info.arch} · ${info.cpuCores} потоков CPU`;
  $('memoryStat').textContent = `${info.usedMemoryPercent}%`;
  $('memoryMeter').style.width = `${info.usedMemoryPercent}%`;
  $('memorySub').textContent = `${(info.totalMemory / 1024 ** 3).toFixed(1)} ГБ всего · ${(info.freeMemory / 1024 ** 3).toFixed(1)} ГБ свободно`;
  $('cpuStat').textContent = info.cpuCores ? `${info.cpuCores} ядер` : '—';
  $('cpuSub').textContent = info.cpu.length > 35 ? `${info.cpu.slice(0, 35)}…` : info.cpu;
  $('versionSub').textContent = `Версия ${info.appVersion}`;
}
function renderActivity() {
  const wrap = $('activityList'); wrap.replaceChildren();
  if (!state.activity.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'События появятся здесь'; wrap.append(empty); return; }
  for (const item of state.activity.slice(0, 5)) {
    const row = document.createElement('div'); row.className = 'activity-row';
    const dot = document.createElement('i'); dot.className = `activity-bullet ${item.type === 'success' ? 'success' : ''}`;
    const content = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.text; const when = document.createElement('small'); when.textContent = `${dateLabel(item.at)} · ${timeLabel(item.at)}`;
    content.append(title, when); row.append(dot, content); wrap.append(row);
  }
}
function renderChat() {
  const wrap = $('chatMessages'); wrap.replaceChildren();
  if (!state.messages.length) {
    const welcome = document.createElement('div'); welcome.className = 'chat-welcome';
    welcome.innerHTML = `<div class="welcome-reactor">J</div><h2>На связи.</h2><p>Я могу помочь с вопросами, заметками и управлением приложениями.</p><div class="suggestion-list"><button data-suggestion="Открой калькулятор">Открой калькулятор <span>↗</span></button><button data-suggestion="Который час?">Который час? <span>↗</span></button><button data-suggestion="Помощь">Что ты умеешь? <span>↗</span></button></div>`;
    wrap.append(welcome); return;
  }
  for (const message of state.messages) {
    const row = document.createElement('div'); row.className = `chat-message ${message.role === 'user' ? 'user' : 'assistant'}`;
    const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = message.role === 'user' ? 'U' : 'J';
    const body = document.createElement('div'); const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = message.content;
    const time = document.createElement('div'); time.className = 'message-time'; time.textContent = timeLabel(message.at);
    body.append(bubble, time); row.append(avatar, body); wrap.append(row);
  }
  wrap.scrollTop = wrap.scrollHeight;
}
function renderNotes() {
  const wrap = $('notesList'); wrap.replaceChildren(); $('notesCount').textContent = state.notes.length;
  if (!state.notes.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Пока нет заметок. Добавь первую выше или скажи JARVIS: «запомни ...».'; wrap.append(empty); }
  for (const note of state.notes) {
    const row = document.createElement('div'); row.className = 'record-item'; const body = document.createElement('div'); body.style.flex = '1';
    const p = document.createElement('p'); p.textContent = note.text; const when = document.createElement('small'); when.textContent = `${dateLabel(note.createdAt)} · ${timeLabel(note.createdAt)}`; body.append(p, when);
    const del = document.createElement('button'); del.className = 'delete-record'; del.textContent = '×'; del.title = 'Удалить заметку'; del.addEventListener('click', async () => { state.notes = await window.jarvis.deleteNote(note.id); renderNotes(); notify('Заметка удалена'); });
    row.append(body, del); wrap.append(row);
  }
  const tasks = $('tasksList'); tasks.replaceChildren(); $('tasksCount').textContent = state.tasks.filter((t) => !t.done).length;
  if (!state.tasks.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Задач пока нет. Добавь задачу выше.'; tasks.append(empty); }
  for (const task of state.tasks) {
    const row = document.createElement('div'); row.className = `record-item ${task.done ? 'done' : ''}`;
    const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = Boolean(task.done); check.addEventListener('change', async () => { state.tasks = await window.jarvis.toggleTask(task.id); renderNotes(); });
    const body = document.createElement('div'); body.style.flex = '1'; const p = document.createElement('p'); p.textContent = task.text; const when = document.createElement('small'); when.textContent = `${dateLabel(task.createdAt)} · ${timeLabel(task.createdAt)}`; body.append(p, when);
    const del = document.createElement('button'); del.className = 'delete-record'; del.textContent = '×'; del.title = 'Удалить задачу'; del.addEventListener('click', async () => { state.tasks = await window.jarvis.deleteTask(task.id); renderNotes(); notify('Задача удалена'); });
    row.append(check, body, del); tasks.append(row);
  }
}
function updateSettingsUi() {
  const s = state.settings;
  $('sideAssistantName').textContent = s.assistantName || 'JARVIS';
  $('topUser').textContent = s.displayName || 'Пользователь';
  $('assistantName').value = s.assistantName || 'JARVIS'; $('displayName').value = s.displayName || 'Пользователь';
  $('voiceOutput').checked = s.voiceOutput !== false; $('soundEffects').checked = Boolean(s.soundEffects);
  $('apiEndpoint').value = s.endpoint || 'https://api.openai.com/v1'; $('apiModel').value = s.model || 'gpt-4o-mini';
  $('apiBadge').textContent = s.hasApiKey ? 'ONLINE' : 'OFFLINE'; $('keyStatus').textContent = s.hasApiKey ? 'API-ключ сохранён и зашифрован локально' : 'Ключ не сохранён';
  $('aiLed').classList.toggle('connected', Boolean(s.hasApiKey)); $('aiStatus').textContent = s.hasApiKey ? 'ИИ подключён' : 'Локальный режим'; $('aiSubStatus').textContent = s.hasApiKey ? `Модель: ${s.model}` : 'ИИ не подключён';
}
function speak(text) {
  if (!state.settings?.voiceOutput || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ru-RU'; utterance.rate = 1.02; window.speechSynthesis.speak(utterance);
}
async function sendMessage(text) {
  const value = (text || '').trim(); if (!value || state.busy) return;
  state.busy = true; $('chatInput').value = ''; $('windowStatus').textContent = 'ОБРАБАТЫВАЮ ЗАПРОС…';
  const welcome = $('chatMessages').querySelector('.chat-welcome'); if (welcome) welcome.remove();
  const row = document.createElement('div'); row.className = 'chat-message user'; const av = document.createElement('div'); av.className = 'message-avatar'; av.textContent = 'U'; const body = document.createElement('div'); const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = value; body.append(bubble); row.append(av, body); $('chatMessages').append(row); $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  const pending = document.createElement('div'); pending.className = 'chat-message assistant'; pending.id = 'pendingReply'; const pendingAv = document.createElement('div'); pendingAv.className = 'message-avatar'; pendingAv.textContent = 'J'; const pendingBody = document.createElement('div'); const pendingBubble = document.createElement('div'); pendingBubble.className = 'message-bubble'; pendingBubble.textContent = 'Анализирую запрос…'; pendingBody.append(pendingBubble); pending.append(pendingAv, pendingBody); $('chatMessages').append(pending);
  try {
    const result = await window.jarvis.sendMessage(value);
    state.messages = result.messages || []; state.notes = result.notes || state.notes; state.tasks = result.tasks || state.tasks;
    if (result.settings) { state.settings = result.settings; updateSettingsUi(); }
    if (result.error) notify('Запрос не выполнен — проверь настройки подключения');
    renderChat(); renderNotes(); speak(result.answer || 'Готово.');
  } catch (error) { pending.remove(); notify(error.message || 'Ошибка выполнения'); }
  finally { state.busy = false; $('windowStatus').textContent = 'СИСТЕМА ГОТОВА'; $('chatInput').focus(); }
}

async function boot() {
  try {
    const data = await window.jarvis.bootstrap();
    state.settings = data.settings; state.messages = data.messages || []; state.notes = data.notes || []; state.tasks = data.tasks || []; state.activity = data.activity || [];
    updateSettingsUi(); renderSystem(data.system); renderActivity(); renderChat(); renderNotes();
  } catch (error) { notify(`Ошибка запуска: ${error.message}`); }
  updateClock(); setInterval(updateClock, 1000);
  setInterval(async () => { try { renderSystem(await window.jarvis.getSystem()); } catch {} }, 15000);
}
function updateClock() {
  const now = new Date(); $('topDate').textContent = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }).format(now);
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
document.querySelectorAll('[data-window]').forEach((button) => button.addEventListener('click', () => window.jarvis.windowAction(button.dataset.window)));
document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => { setView('chat'); sendMessage(button.dataset.command); }));
document.addEventListener('click', (event) => { const suggestion = event.target.closest('[data-suggestion]'); if (suggestion) sendMessage(suggestion.dataset.suggestion); });
$('chatForm').addEventListener('submit', (event) => { event.preventDefault(); sendMessage($('chatInput').value); });
$('clearChat').addEventListener('click', async () => { if (!confirm('Очистить историю диалога?')) return; state.messages = await window.jarvis.clearChat(); renderChat(); notify('История диалога очищена'); });
$('refreshSystem').addEventListener('click', async () => { renderSystem(await window.jarvis.getSystem()); notify('Данные системы обновлены'); });
document.querySelectorAll('[data-launch]').forEach((button) => button.addEventListener('click', async () => { try { notify(await window.jarvis.launchApp(button.dataset.launch)); } catch (error) { notify(error.message); } }));
document.querySelectorAll('[data-site]').forEach((button) => button.addEventListener('click', async () => { try { await window.jarvis.openSite(button.dataset.site); notify('Открываю сайт в браузере'); } catch (error) { notify(error.message); } }));
$('openDownloads').addEventListener('click', async () => { await window.jarvis.openDownloads(); notify('Открываю папку загрузок'); });
$('noteForm').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('noteInput'); if (!input.value.trim()) return; state.notes = await window.jarvis.addNote(input.value); input.value = ''; renderNotes(); notify('Заметка сохранена'); });
$('taskForm').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('taskInput'); if (!input.value.trim()) return; state.tasks = await window.jarvis.addTask(input.value); input.value = ''; renderNotes(); notify('Задача добавлена'); });
$('settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); try { state.settings = await window.jarvis.saveSettings({ assistantName: $('assistantName').value, displayName: $('displayName').value, voiceOutput: $('voiceOutput').checked, soundEffects: $('soundEffects').checked }); updateSettingsUi(); notify('Настройки сохранены'); } catch (error) { notify(error.message); } });
$('apiForm').addEventListener('submit', async (event) => { event.preventDefault(); try { state.settings = await window.jarvis.saveSettings({ ...state.settings, assistantName: $('assistantName').value || state.settings.assistantName, displayName: $('displayName').value || state.settings.displayName, endpoint: $('apiEndpoint').value, model: $('apiModel').value, apiKey: $('apiKey').value }); $('apiKey').value = ''; updateSettingsUi(); notify('Подключение сохранено'); } catch (error) { notify(error.message); } });
$('clearApiKey').addEventListener('click', async () => { if (!confirm('Удалить сохранённый API-ключ?')) return; try { state.settings = await window.jarvis.saveSettings({ ...state.settings, clearApiKey: true }); updateSettingsUi(); notify('API-ключ удалён'); } catch (error) { notify(error.message); } });

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition(); recognition.lang = 'ru-RU'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onstart = () => { $('voiceButton').classList.add('listening'); $('windowStatus').textContent = 'СЛУШАЮ…'; };
  recognition.onend = () => { $('voiceButton').classList.remove('listening'); $('windowStatus').textContent = 'СИСТЕМА ГОТОВА'; };
  recognition.onerror = () => notify('Не удалось распознать речь. Можно ввести команду текстом.');
  recognition.onresult = (event) => { setView('chat'); sendMessage(event.results[0][0].transcript); };
  $('voiceButton').addEventListener('click', () => { try { recognition.start(); } catch { notify('Голосовой ввод уже активен'); } });
} else {
  $('voiceButton').addEventListener('click', () => notify('Голосовое распознавание недоступно в этой сборке. Используй ввод текста.'));
}

boot();
