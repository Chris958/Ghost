const ticker = document.querySelector('#ticker');
const settings = document.querySelector('#settings');
const controls = Object.fromEntries([
  'token', 'testToken', 'tokenStatus', 'stockForm', 'stockCode', 'stockList',
  'fontSize', 'fontSizeValue', 'opacity', 'opacityValue', 'upColor', 'downColor',
  'flatColor', 'shortcut', 'clickThrough', 'saveStatus', 'save', 'closeSettings'
].map((id) => [id, document.querySelector(`#${id}`)]));

let config;
let quoteState = { quotes: [], error: '' };
let settingsOpen = false;

function applyAppearance(value) {
  document.documentElement.style.setProperty('--font-size', `${value.fontSize}px`);
  document.documentElement.style.setProperty('--ghost-opacity', value.opacity);
  document.documentElement.style.setProperty('--up', value.upColor);
  document.documentElement.style.setProperty('--down', value.downColor);
  document.documentElement.style.setProperty('--flat', value.flatColor);
}

function quoteRow(quote) {
  const direction = quote.change > 0.0001 ? 'up' : quote.change < -0.0001 ? 'down' : 'flat';
  const sign = quote.change > 0 ? '+' : '';
  const row = document.createElement('div');
  row.className = `quote quote--${direction}`;
  const name = document.createElement('span');
  name.className = 'quote__name';
  name.textContent = quote.name;
  const change = document.createElement('span');
  change.className = 'quote__change';
  change.textContent = quote.change == null ? '--' : `${sign}${quote.change.toFixed(2)}%`;
  row.append(name, change);
  return row;
}

function renderTicker() {
  ticker.replaceChildren();
  if (quoteState.quotes.length) quoteState.quotes.forEach((quote) => ticker.append(quoteRow(quote)));
  else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = config?.token ? '等待行情…' : '从系统托盘打开设置';
    ticker.append(placeholder);
  }
  requestAnimationFrame(() => {
    const rect = ticker.getBoundingClientRect();
    window.ghost.resize({ width: rect.width + 2, height: rect.height + 2 });
  });
}

function renderStockList() {
  controls.stockList.replaceChildren();
  config.stocks.forEach((code) => {
    const chip = document.createElement('span');
    chip.className = 'stock-chip';
    chip.append(document.createTextNode(code));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `删除 ${code}`);
    remove.addEventListener('click', () => {
      config.stocks = config.stocks.filter((stock) => stock !== code);
      renderStockList();
    });
    chip.append(remove);
    controls.stockList.append(chip);
  });
}

function populateSettings() {
  controls.token.value = config.token || '';
  controls.fontSize.value = config.fontSize;
  controls.opacity.value = config.opacity;
  controls.upColor.value = config.upColor;
  controls.downColor.value = config.downColor;
  controls.flatColor.value = config.flatColor;
  controls.shortcut.value = config.shortcut;
  controls.clickThrough.checked = config.clickThrough;
  updateOutputs();
  renderStockList();
}

function updateOutputs() {
  controls.fontSizeValue.value = `${controls.fontSize.value}px`;
  controls.opacityValue.value = `${Math.round(Number(controls.opacity.value) * 100)}%`;
  applyAppearance({
    ...config,
    fontSize: Number(controls.fontSize.value),
    opacity: Number(controls.opacity.value),
    upColor: controls.upColor.value,
    downColor: controls.downColor.value,
    flatColor: controls.flatColor.value
  });
}

function openSettings() {
  settingsOpen = true;
  ticker.classList.add('hidden');
  settings.classList.remove('hidden');
  populateSettings();
  window.ghost.resize({ width: 458, height: 666 });
}

function closeSettings() {
  settingsOpen = false;
  settings.classList.add('hidden');
  ticker.classList.remove('hidden');
  applyAppearance(config);
  renderTicker();
}

function acceleratorFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  const ignored = ['Control', 'Meta', 'Alt', 'Shift'];
  if (ignored.includes(event.key)) return modifiers.join('+');
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const aliases = { ' ': 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  key = aliases[key] || key;
  return [...modifiers, key].join('+');
}

controls.stockForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = controls.stockCode.value.trim().toUpperCase();
  if (!raw) return;
  const code = raw.includes('.') ? raw : /^(4|8|92)/.test(raw) ? `${raw}.BJ` : /^(5|6|9)/.test(raw) ? `${raw}.SH` : `${raw}.SZ`;
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(code)) {
    controls.saveStatus.textContent = '股票代码格式不正确';
    return;
  }
  if (!config.stocks.includes(code)) config.stocks.push(code);
  controls.stockCode.value = '';
  controls.saveStatus.textContent = '';
  renderStockList();
});

['fontSize', 'opacity', 'upColor', 'downColor', 'flatColor'].forEach((id) => {
  controls[id].addEventListener('input', updateOutputs);
});

controls.shortcut.addEventListener('keydown', (event) => {
  event.preventDefault();
  const value = acceleratorFromEvent(event);
  if (value.split('+').length >= 2) controls.shortcut.value = value;
});

controls.testToken.addEventListener('click', async () => {
  controls.testToken.disabled = true;
  controls.tokenStatus.textContent = '正在连接…';
  const result = await window.ghost.testToken(controls.token.value);
  controls.testToken.disabled = false;
  controls.tokenStatus.textContent = result.message;
  controls.tokenStatus.style.color = result.ok ? '#54d68a' : '#ff8c99';
});

controls.save.addEventListener('click', async () => {
  controls.save.disabled = true;
  controls.saveStatus.className = 'status';
  controls.saveStatus.textContent = '';
  try {
    config = await window.ghost.saveConfig({
      token: controls.token.value,
      stocks: config.stocks,
      fontSize: Number(controls.fontSize.value),
      opacity: Number(controls.opacity.value),
      upColor: controls.upColor.value,
      downColor: controls.downColor.value,
      flatColor: controls.flatColor.value,
      shortcut: controls.shortcut.value,
      clickThrough: controls.clickThrough.checked
    });
    controls.saveStatus.className = 'status success';
    controls.saveStatus.textContent = '已保存';
    setTimeout(closeSettings, 350);
  } catch (error) {
    controls.saveStatus.textContent = error.message;
  } finally {
    controls.save.disabled = false;
  }
});

controls.closeSettings.addEventListener('click', closeSettings);
window.ghost.onSettingsOpen(openSettings);
window.ghost.onConfig((value) => {
  config = { ...config, ...value };
  applyAppearance(config);
});
window.ghost.onQuotes((value) => {
  quoteState = value;
  if (!settingsOpen) renderTicker();
});

window.ghost.getConfig().then((value) => {
  config = value;
  applyAppearance(config);
  renderTicker();
});
