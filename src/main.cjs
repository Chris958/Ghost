const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCode, rowsFromTushare, rowsFromSina } = require('./core.cjs');

const DEFAULT_CONFIG = {
  token: '',
  dataSource: 'realtime_quote',
  stocks: ['000001.SZ', '600519.SH'],
  fontSize: 18,
  opacity: 0.78,
  upColor: '#ff4d5e',
  downColor: '#28c76f',
  flatColor: '#c7ced9',
  shortcut: 'CommandOrControl+Shift+G',
  clickThrough: false,
  windowPosition: null
};

let mainWindow;
let tray;
let pollTimer;
let config;
let lastQuotes = [];
let lastError = '';
let pollInFlight = false;
let permissionCache = { token: '', validUntil: 0 };

function configPath() {
  return path.join(app.getPath('userData'), 'ghost-config.json');
}

function loadConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function safePosition(position) {
  const fallback = { x: 28, y: 90 };
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return fallback;
  const visible = screen.getAllDisplays().some(({ bounds }) =>
    position.x >= bounds.x - 120 && position.x < bounds.x + bounds.width &&
    position.y >= bounds.y - 80 && position.y < bounds.y + bounds.height
  );
  return visible ? position : fallback;
}

function createWindow() {
  const position = safePosition(config.windowPosition);
  mainWindow = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: 250,
    height: 120,
    minWidth: 180,
    minHeight: 48,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(Boolean(config.clickThrough), { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.showInactive());
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    config.windowPosition = { x, y };
    saveConfig();
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function trayIcon() {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWEAYAAACUJLB4AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCBMCFRguiovYAAACc0lEQVRIx2NgGGKAkVyNgoISEurqPK4QnuN8CB1qBKGdwiC05DkI/TwQQu+LgdBrn0L56e/fv3hx8+bns1R3MMSB7CchvPI8CN14gjrhVusAoXtiIB74kUq2gyEOVZoA4d34BaFZS6njUHTwazeE1vCHOPz+d6IdDHGowhkI774xbRxICCg+hTj8gQxMhAm7Q9nXQHh3vhNvOC3ATRaIezgqcDoYAoofQGhmG2KNtigzO2tsx8Aw68w0+55aBoZ3754/v3EDwYfJkwbYxKHuCYSJwJMENNd3Q3ifS4g1spOnlbUmkYEh9VHSo5hywupny82TW9LJwFD+pfp3y3xSPcBXjBbCju2khiixDoUBmHryQtzpGJqDg3YTqzUpLKEo0p6BYT3zxpxt0xkYhIQkJTU0EHwYwCUP008aCP6NliQeQv0sdxCXFljahAGYQ3CpIyRPyBxU8OQ4WghLTCbVz3M/zgjuyyefTxqQsUQPYXNoCOOswdBDhlqAuBB+wYsWwvsyqO8U4oD0Ryk1iWJCqvZqoTl4LcdAOTi7NMMniWAZtfonmoMP1FMWAuSDqd0ztsyrJKRqbwncwZA6+8stCK/6D3khQD54yv/s1oteXLJ1b6Hui8VRNffCQroVPQRmVMzuXqTEwKDLbGzvMBuRWWB8cuWxg18HIHS3A0yEQGtNMRvCuzeFdmGLDygtgzYzowk6GNXhSrYQ3q1FEJpZgTYO/P0JQqsdhDYr/dBVMBEyAqLx3mEIj3sxhK75QV2HVj+G0Lw8uBwKA5T26YQhPAdoQz8kFkI7XYPQEish9Ato+b4P2hpcC222HlCH9uneE2svABrAIucE9MfxAAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${png}`);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Ghost 幽灵看盘');
  tray.on('click', toggleVisibility);
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: mainWindow?.isVisible() ? '快速隐藏' : '显示看盘', click: toggleVisibility },
    { label: '设置…', click: openSettings },
    { type: 'separator' },
    {
      label: config.clickThrough ? '关闭鼠标穿透' : '开启鼠标穿透',
      click: () => updateConfig({ clickThrough: !config.clickThrough })
    },
    { type: 'separator' },
    { label: '退出 Ghost', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else mainWindow.showInactive();
  rebuildTrayMenu();
}

function openSettings() {
  if (!mainWindow) return;
  if (config.clickThrough) {
    config.clickThrough = false;
    mainWindow.setIgnoreMouseEvents(false);
    saveConfig();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('ghost:config', publicConfig());
  mainWindow.webContents.send('ghost:settings-open');
  rebuildTrayMenu();
}

function registerShortcut(shortcut) {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(shortcut, toggleVisibility);
  return ok;
}

function updateConfig(patch) {
  const next = { ...config, ...patch };
  if (patch.stocks) next.stocks = [...new Set(patch.stocks.map(normalizeCode))].slice(0, 50);
  next.fontSize = Math.min(42, Math.max(12, Number(next.fontSize) || 18));
  next.opacity = Math.min(1, Math.max(0.15, Number(next.opacity) || 0.78));
  next.dataSource = next.dataSource === 'rt_k' ? 'rt_k' : 'realtime_quote';

  if (patch.shortcut && patch.shortcut !== config.shortcut && !registerShortcut(patch.shortcut)) {
    registerShortcut(config.shortcut);
    throw new Error('快捷键已被其他应用占用，请换一个组合');
  }

  if (next.token !== config.token) permissionCache = { token: '', validUntil: 0 };
  config = next;
  saveConfig();
  mainWindow?.setIgnoreMouseEvents(Boolean(config.clickThrough), { forward: true });
  mainWindow?.webContents.send('ghost:config', publicConfig());
  rebuildTrayMenu();
  pollQuotes(true);
  return publicConfig();
}

function publicConfig() {
  return { ...config, token: config.token ? '••••••••' : '' };
}

async function tushareRequest(apiName, params, fields) {
  if (!config.token) throw new Error('请先在设置中填写 Tushare Token');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.tushare.pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_name: apiName, token: config.token, params, fields }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Tushare HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyRealtimeQuoteAccess() {
  if (!config.token) throw new Error('请先在设置中填写 Tushare Token');
  if (permissionCache.token === config.token && permissionCache.validUntil > Date.now()) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.tushare.pro/dataapi/sdk-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_token: config.token,
        event_name: 'realtime_quote',
        event_detail: '个股实时交易数据'
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Tushare 权限验证失败（HTTP ${response.status}）`);
    const payload = await response.json();
    if (payload.message !== 'success') {
      throw new Error(payload.msg || payload.message || '当前 Token 无 realtime_quote 权限');
    }
    permissionCache = { token: config.token, validUntil: Date.now() + 30 * 60 * 1000 };
  } finally {
    clearTimeout(timeout);
  }
}

async function tushareRealtimeQuotes() {
  await verifyRealtimeQuoteAccess();
  const symbols = config.stocks.map((code) => {
    const [digits, market] = code.split('.');
    return `${market.toLowerCase()}${digits}`;
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://hq.sinajs.cn/rn=${Date.now()}&list=${symbols.join(',')}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119 Safari/537.36',
        Referer: 'https://finance.sina.com.cn/'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`实时快照源 HTTP ${response.status}`);
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
    const rows = rowsFromSina(text);
    if (!rows.length) throw new Error('实时快照源未返回有效行情');
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

async function pollQuotes(force = false) {
  if (!config.token || !config.stocks.length) {
    lastQuotes = [];
    lastError = '';
    sendState();
    return;
  }
  if (!force && !isLikelyTradingSession()) return;
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const fresh = config.dataSource === 'rt_k'
      ? rowsFromTushare(await tushareRequest(
        'rt_k',
        { ts_code: config.stocks.join(',') },
        'ts_code,name,pre_close,close,trade_time'
      ))
      : await tushareRealtimeQuotes();
    const byCode = new Map(fresh.map((quote) => [quote.code, quote]));
    lastQuotes = config.stocks.map((code) => byCode.get(code)).filter(Boolean);
    lastError = '';
  } catch (error) {
    lastError = error.name === 'AbortError' ? 'Tushare 请求超时' : error.message;
  } finally {
    pollInFlight = false;
  }
  sendState();
}

function isLikelyTradingSession(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 35) ||
    (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5);
}

function sendState() {
  mainWindow?.webContents.send('ghost:quotes', { quotes: lastQuotes, error: lastError });
}

function setupIpc() {
  ipcMain.handle('ghost:get-config', () => publicConfig());
  ipcMain.handle('ghost:save-config', (_event, patch) => {
    if (patch.token === '••••••••') delete patch.token;
    return updateConfig(patch);
  });
  ipcMain.handle('ghost:test-token', async (_event, options = {}) => {
    const oldToken = config.token;
    const oldDataSource = config.dataSource;
    if (options.token && options.token !== '••••••••') config.token = options.token.trim();
    config.dataSource = options.dataSource === 'rt_k' ? 'rt_k' : 'realtime_quote';
    try {
      const code = config.stocks[0] || '000001.SZ';
      const rows = config.dataSource === 'rt_k'
        ? rowsFromTushare(await tushareRequest('rt_k', { ts_code: code }, 'ts_code,name,pre_close,close,trade_time'))
        : await tushareRealtimeQuotes();
      if (!rows.length) throw new Error('接口成功，但未返回行情数据');
      const mode = config.dataSource === 'rt_k' ? 'rt_k' : 'realtime_quote';
      return { ok: true, message: `${mode} 连接成功：${rows[0].name}` };
    } catch (error) {
      return { ok: false, message: error.message };
    } finally {
      config.token = oldToken;
      config.dataSource = oldDataSource;
    }
  });
  ipcMain.handle('ghost:hide', () => mainWindow?.hide());
  ipcMain.handle('ghost:refresh', () => pollQuotes(true));
  ipcMain.handle('ghost:resize', (_event, { width, height }) => {
    if (!mainWindow) return;
    mainWindow.setSize(
      Math.min(520, Math.max(180, Math.round(width))),
      Math.min(720, Math.max(48, Math.round(height)))
    );
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    config = loadConfig();
    setupIpc();
    createWindow();
    createTray();
    registerShortcut(config.shortcut);
    pollTimer = setInterval(() => pollQuotes(false), 5000);
    pollQuotes(true);
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(pollTimer);
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {});
