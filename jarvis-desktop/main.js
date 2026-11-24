const { app, BrowserWindow, ipcMain, shell, safeStorage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const isDev = !app.isPackaged;
let mainWindow;
let dataFile;
let store;

const DEFAULT_STORE = {
  settings: {
    assistantName: 'JARVIS',
    displayName: 'Пользователь',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    voiceOutput: true,
    soundEffects: false
  },
  encryptedApiKey: '',
  messages: [],
  notes: [],
  tasks: [],
  activity: []
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function saveStore() {
  try {
    const tempFile = `${dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tempFile, dataFile);
  } catch (error) {
    console.error('Не удалось сохранить данные:', error);
  }
}

function loadStore() {
  try {
    if (fs.existsSync(dataFile)) {
      const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      store = {
        ...clone(DEFAULT_STORE),
        ...saved,
        settings: { ...DEFAULT_STORE.settings, ...(saved.settings || {}) },
        messages: Array.isArray(saved.messages) ? saved.messages : [],
        notes: Array.isArray(saved.notes) ? saved.notes : [],
        tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
        activity: Array.isArray(saved.activity) ? saved.activity : []
      };
    } else {
      store = clone(DEFAULT_STORE);
      saveStore();
    }
  } catch (error) {
    console.error('Файл данных повреждён, создаю новый:', error);
    store = clone(DEFAULT_STORE);
    saveStore();
  }
}

function publicSettings() {
  return {
    ...store.settings,
    hasApiKey: Boolean(store.encryptedApiKey),
    endpoint: store.settings.endpoint || DEFAULT_STORE.settings.endpoint,
    model: store.settings.model || DEFAULT_STORE.settings.model
  };
}

function bootstrapData() {
  return {
    settings: publicSettings(),
    messages: store.messages,
    notes: store.notes,
    tasks: store.tasks,
    activity: store.activity.slice(0, 12),
    system: getSystemInfo()
  };
}

function recordActivity(text, type = 'info') {
  store.activity.unshift({ id: cryptoId(), text, type, at: new Date().toISOString() });
  store.activity = store.activity.slice(0, 60);
  saveStore();
}

function cryptoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSystemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    platform: process.platform,
    platformName: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
    arch: os.arch(),
    cpu: os.cpus()?.[0]?.model || 'Неизвестно',
    cpuCores: os.cpus()?.length || 0,
    totalMemory: total,
    freeMemory: free,
    usedMemoryPercent: total ? Math.round(((total - free) / total) * 100) : 0,
    uptime: os.uptime(),
    appVersion: app.getVersion()
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#070b12',
    frame: false,
    show: false,
    title: 'JARVIS',
    icon: path.join(__dirname, 'assets', 'jarvis.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(parsed.toString());
    } catch (_) {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  if (isDev) mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('Renderer crashed:', details));
}

function assertTrusted(event) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) throw new Error('Недоверенный источник IPC');
}

function cleanText(value, max = 4000) {
  if (typeof value !== 'string') throw new Error('Ожидался текст');
  const result = value.trim();
  if (!result || result.length > max) throw new Error('Текст пустой или слишком длинный');
  return result;
}

function getApiKey() {
  if (!store.encryptedApiKey) return '';
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(store.encryptedApiKey, 'base64'));
  } catch (error) {
    console.error('Не удалось расшифровать API-ключ:', error);
    return '';
  }
}

function normalizeEndpoint(raw) {
  const parsed = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('Для API разрешён HTTPS. HTTP допускается только для localhost.');
  }
  if (parsed.username || parsed.password) throw new Error('Не указывай логин или пароль в адресе API.');
  const base = parsed.toString().replace(/\/$/, '');
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

function launchAllowedApp(appName) {
  const p = process.platform;
  const map = {
    calculator: p === 'win32' ? ['calc.exe', []] : p === 'darwin' ? ['open', ['-a', 'Calculator']] : ['gnome-calculator', []],
    notepad: p === 'win32' ? ['notepad.exe', []] : p === 'darwin' ? ['open', ['-a', 'TextEdit']] : ['gedit', []],
    explorer: p === 'win32' ? ['explorer.exe', []] : p === 'darwin' ? ['open', [os.homedir()]] : ['xdg-open', [os.homedir()]],
    taskmanager: p === 'win32' ? ['taskmgr.exe', []] : p === 'darwin' ? ['open', ['-a', 'Activity Monitor']] : ['gnome-system-monitor', []]
  };
  const entry = map[appName];
  if (!entry) throw new Error('Эта программа не входит в список разрешённых команд.');
  const child = spawn(entry[0], entry[1], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (error) => console.error('Не удалось запустить приложение:', error));
  child.unref();
  const labels = { calculator: 'Калькулятор', notepad: 'Блокнот', explorer: 'Проводник / домашняя папка', taskmanager: 'Диспетчер задач / монитор системы' };
  recordActivity(`Запущено: ${labels[appName]}`, 'success');
  return `Запускаю ${labels[appName]}.`;
}

async function openUrl(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Разрешены только web-ссылки.');
  await shell.openExternal(parsed.toString());
}

function handleBuiltInCommand(text) {
  const q = text.toLowerCase().replace(/[!?.,]/g, '').trim();
  const now = new Date();
  if (/^(помощь|команды|что ты умеешь)$/.test(q)) {
    return { handled: true, text: 'Я могу сообщить время и дату, открыть сайты, запустить калькулятор, блокнот, проводник и диспетчер задач, выполнить поиск, сохранить заметку или задачу. Например: «открой калькулятор», «найди погода», «запомни купить молоко», «добавь задачу закончить проект».' };
  }
  if (q.includes('который час') || q === 'время') {
    return { handled: true, text: `Сейчас ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(now)}.` };
  }
  if (q.includes('какое сегодня число') || q.includes('какая дата') || q === 'дата') {
    return { handled: true, text: `Сегодня ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' }).format(now)}.` };
  }
  if (q.includes('открой youtube') || q.includes('открой ютуб')) {
    openUrl('https://www.youtube.com');
    recordActivity('Открыт YouTube', 'success');
    return { handled: true, text: 'Открываю YouTube в браузере.' };
  }
  if (q.includes('открой google') || q.includes('открой гугл')) {
    openUrl('https://www.google.com');
    recordActivity('Открыт Google', 'success');
    return { handled: true, text: 'Открываю Google в браузере.' };
  }
  if (q.includes('открой калькулятор') || q === 'калькулятор') return { handled: true, text: launchAllowedApp('calculator') };
  if (q.includes('открой блокнот') || q === 'блокнот') return { handled: true, text: launchAllowedApp('notepad') };
  if (q.includes('открой проводник') || q === 'проводник') return { handled: true, text: launchAllowedApp('explorer') };
  if (q.includes('диспетчер задач') || q.includes('монитор системы')) return { handled: true, text: launchAllowedApp('taskmanager') };
  if (q.includes('открой загрузки') || q.includes('папку загрузки')) {
    shell.openPath(app.getPath('downloads'));
    recordActivity('Открыта папка загрузок', 'success');
    return { handled: true, text: 'Открываю папку загрузок.' };
  }
  if (q.startsWith('найди ') || q.startsWith('поиск ')) {
    const query = text.replace(/^(найди|поиск)\s+/i, '').trim();
    if (!query) return { handled: true, text: 'Напиши, что именно нужно найти.' };
    openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    recordActivity(`Поиск: ${query}`, 'success');
    return { handled: true, text: `Ищу в интернете: ${query}.` };
  }
  if (q.startsWith('запомни ')) {
    const content = text.replace(/^запомни\s+/i, '').trim();
    if (!content) return { handled: true, text: 'Напиши текст заметки после слова «запомни».' };
    const note = { id: cryptoId(), text: content, createdAt: new Date().toISOString() };
    store.notes.unshift(note);
    saveStore();
    recordActivity('Добавлена заметка', 'success');
    return { handled: true, text: `Сохранил в заметках: ${content}` };
  }
  if (q.startsWith('добавь задачу ') || q.startsWith('создай задачу ')) {
    const content = text.replace(/^(добавь задачу|создай задачу)\s+/i, '').trim();
    if (!content) return { handled: true, text: 'Укажи, какую задачу нужно добавить.' };
    store.tasks.unshift({ id: cryptoId(), text: content, done: false, createdAt: new Date().toISOString() });
    saveStore();
    recordActivity('Добавлена задача', 'success');
    return { handled: true, text: `Добавил задачу: ${content}` };
  }
  if (q.includes('покажи заметки') || q.includes('мои заметки')) {
    return { handled: true, text: store.notes.length ? `Твои заметки: ${store.notes.slice(0, 15).map((n, i) => `${i + 1}. ${n.text}`).join('; ')}` : 'Пока заметок нет.' };
  }
  if (q.includes('покажи задачи') || q.includes('мои задачи')) {
    const active = store.tasks.filter((t) => !t.done);
    return { handled: true, text: active.length ? `Активные задачи: ${active.slice(0, 15).map((t, i) => `${i + 1}. ${t.text}`).join('; ')}` : 'Активных задач нет.' };
  }
  if (q === 'привет' || q.startsWith('привет ')) return { handled: true, text: 'Приветствую. Системы в норме. Готов к работе.' };
  return { handled: false };
}

async function askModel() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('ИИ не подключён. Открой «Настройки» и добавь API-ключ. Локальные команды работают и без него.');
  const endpoint = normalizeEndpoint(store.settings.endpoint || DEFAULT_STORE.settings.endpoint);
  const messages = store.messages.slice(-20).map(({ role, content }) => ({ role, content }));
  const system = `Ты JARVIS — дружелюбный, компетентный русскоязычный настольный ассистент. Отвечай естественно, по делу и на русском языке, если пользователь не попросил иначе. Не утверждай, что выполнил действия на компьютере, если действие не было явно выполнено локальной командой. Ты не имеешь прямого доступа к файлам, экрану или приложениям пользователя. Сегодня: ${new Date().toLocaleString('ru-RU')}. ОС: ${process.platform}.`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: store.settings.model || DEFAULT_STORE.settings.model, messages: [{ role: 'system', content: system }, ...messages], temperature: 0.7 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Ошибка API: ${response.status}`);
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('ИИ вернул пустой ответ.');
  return answer.trim();
}

function appendMessage(role, content) {
  store.messages.push({ id: cryptoId(), role, content, at: new Date().toISOString() });
  store.messages = store.messages.slice(-100);
  saveStore();
}

ipcMain.handle('app:bootstrap', (event) => { assertTrusted(event); return bootstrapData(); });
ipcMain.handle('app:system', (event) => { assertTrusted(event); return getSystemInfo(); });
ipcMain.handle('app:window', (event, action) => {
  assertTrusted(event);
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
  else throw new Error('Неизвестная команда окна');
  return true;
});
ipcMain.handle('assistant:send', async (event, rawText) => {
  assertTrusted(event);
  const text = cleanText(rawText, 4000);
  appendMessage('user', text);
  try {
    const builtIn = handleBuiltInCommand(text);
    const answer = builtIn.handled ? builtIn.text : await askModel();
    appendMessage('assistant', answer);
    if (builtIn.handled) recordActivity(`Команда: ${text}`, 'success');
    return { answer, messages: store.messages, settings: publicSettings(), notes: store.notes, tasks: store.tasks };
  } catch (error) {
    const answer = `Не удалось выполнить запрос: ${error.message}`;
    appendMessage('assistant', answer);
    return { answer, messages: store.messages, error: true, notes: store.notes, tasks: store.tasks };
  }
});
ipcMain.handle('assistant:clear', (event) => { assertTrusted(event); store.messages = []; saveStore(); return []; });
ipcMain.handle('settings:save', (event, incoming) => {
  assertTrusted(event);
  if (!incoming || typeof incoming !== 'object') throw new Error('Некорректные настройки');
  const assistantName = cleanText(String(incoming.assistantName || 'JARVIS'), 40);
  const displayName = cleanText(String(incoming.displayName || 'Пользователь'), 60);
  const endpoint = cleanText(String(incoming.endpoint || store.settings.endpoint || DEFAULT_STORE.settings.endpoint), 300);
  const model = cleanText(String(incoming.model || store.settings.model || DEFAULT_STORE.settings.model), 100);
  normalizeEndpoint(endpoint);
  store.settings = { ...store.settings, assistantName, displayName, endpoint, model, voiceOutput: Boolean(incoming.voiceOutput), soundEffects: Boolean(incoming.soundEffects) };
  if (typeof incoming.apiKey === 'string' && incoming.apiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Системное шифрование недоступно. Ключ не сохранён.');
    store.encryptedApiKey = safeStorage.encryptString(incoming.apiKey.trim()).toString('base64');
  }
  if (incoming.clearApiKey === true) store.encryptedApiKey = '';
  saveStore();
  recordActivity('Настройки обновлены', 'success');
  return publicSettings();
});
ipcMain.handle('notes:add', (event, rawText) => {
  assertTrusted(event);
  const text = cleanText(rawText, 2000);
  const note = { id: cryptoId(), text, createdAt: new Date().toISOString() };
  store.notes.unshift(note); saveStore(); recordActivity('Добавлена заметка', 'success');
  return store.notes;
});
ipcMain.handle('notes:delete', (event, id) => {
  assertTrusted(event); store.notes = store.notes.filter((n) => n.id !== id); saveStore(); return store.notes;
});
ipcMain.handle('tasks:add', (event, rawText) => {
  assertTrusted(event);
  const text = cleanText(rawText, 500);
  store.tasks.unshift({ id: cryptoId(), text, done: false, createdAt: new Date().toISOString() }); saveStore(); recordActivity('Добавлена задача', 'success');
  return store.tasks;
});
ipcMain.handle('tasks:toggle', (event, id) => {
  assertTrusted(event); const task = store.tasks.find((t) => t.id === id); if (task) task.done = !task.done; saveStore(); return store.tasks;
});
ipcMain.handle('tasks:delete', (event, id) => {
  assertTrusted(event); store.tasks = store.tasks.filter((t) => t.id !== id); saveStore(); return store.tasks;
});
ipcMain.handle('apps:launch', (event, appName) => { assertTrusted(event); return launchAllowedApp(appName); });
ipcMain.handle('apps:open-url', async (event, target) => {
  assertTrusted(event);
  const allowed = { youtube: 'https://www.youtube.com', google: 'https://www.google.com', wikipedia: 'https://ru.wikipedia.org', github: 'https://github.com' };
  if (!allowed[target]) throw new Error('Сайт отсутствует в списке');
  await openUrl(allowed[target]); recordActivity(`Открыт сайт: ${target}`, 'success'); return true;
});
ipcMain.handle('apps:open-downloads', (event) => { assertTrusted(event); shell.openPath(app.getPath('downloads')); return true; });
ipcMain.handle('system:theme', (event, theme) => { assertTrusted(event); nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'; return true; });

app.whenReady().then(() => {
  dataFile = path.join(app.getPath('userData'), 'jarvis-data.json');
  loadStore();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
