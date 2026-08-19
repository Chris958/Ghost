const mode = new URLSearchParams(location.search).get('mode') || 'ticker';
const isSettings = mode === 'settings';
const ticker = document.querySelector('#ticker');
const settings = document.querySelector('#settings');
const controls = Object.fromEntries([
  'token', 'testToken', 'tokenStatus', 'dataSource', 'stockForm', 'stockCode', 'stockList',
  'stockSuggestions', 'dataStatus', 'fontSize', 'fontSizeValue', 'opacity', 'opacityValue',
  'upColor', 'downColor', 'flatColor', 'shortcut', 'clickThrough', 'saveStatus', 'save',
  'closeSettings'
].map((id) => [id, document.querySelector(`#${id}`)]));

let config;
let quoteState = { quotes: [], error: '', updatedAt: 0 };
let suggestions = [];
let searchTimer;
let searchSequence = 0;

document.body.classList.add(isSettings ? 'settings-mode' : 'ticker-mode');
ticker.classList.toggle('hidden', isSettings);
settings.classList.toggle('hidden', !isSettings);

function applyAppearance(value) {
  if (!value) return;
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
  if (isSettings || !config) return;
  ticker.replaceChildren();
  if (quoteState.quotes.length) {
    quoteState.quotes.forEach((quote) => ticker.append(quoteRow(quote)));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = quoteState.error ? '行情暂不可用' : '等待行情…';
    ticker.append(placeholder);
  }
  requestAnimationFrame(() => {
    const rect = ticker.getBoundingClientRect();
    window.ghost.resize({ width: rect.width + 2, height: rect.height + 2 });
  });
}

function renderDataHealth() {
  if (!isSettings) return;
  const container = controls.dataStatus.parentElement;
  container.classList.remove('success', 'error');
  if (quoteState.error) {
    container.classList.add('error');
    controls.dataStatus.textContent = quoteState.error;
  } else if (quoteState.quotes.length) {
    container.classList.add('success');
    const time = quoteState.updatedAt ? new Date(quoteState.updatedAt).toLocaleTimeString() : '';
    controls.dataStatus.textContent = `行情正常 · ${quoteState.quotes.length} 只股票 · ${time}`;
  } else {
    controls.dataStatus.textContent = '等待首次行情更新';
  }
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

function updateSourceHint() {
  const paid = controls.dataSource.value === 'rt_k';
  controls.token.disabled = !paid;
  controls.tokenStatus.textContent = paid ? 'rt_k 需要已开通实时日线权限的 Token' : '免费实时模式无需 Token';
  controls.tokenStatus.style.color = '';
}

function populateSettings() {
  if (!isSettings || !config) return;
  controls.token.value = config.token || '';
  controls.dataSource.value = config.dataSource || 'realtime_quote';
  controls.fontSize.value = config.fontSize;
  controls.opacity.value = config.opacity;
  controls.upColor.value = config.upColor;
  controls.downColor.value = config.downColor;
  controls.flatColor.value = config.flatColor;
  controls.shortcut.value = config.shortcut;
  controls.clickThrough.checked = config.clickThrough;
  updateSourceHint();
  updateOutputs();
  renderStockList();
  renderDataHealth();
}

function updateOutputs() {
  if (!isSettings || !config) return;
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

function acceleratorFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return modifiers.join('+');
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const aliases = { ' ': 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  key = aliases[key] || key;
  return [...modifiers, key].join('+');
}

function addStock(code) {
  if (!config.stocks.includes(code)) config.stocks.push(code);
  controls.stockCode.value = '';
  controls.saveStatus.textContent = '';
  suggestions = [];
  renderSuggestions();
  renderStockList();
}

function normalizeDirectCode(raw) {
  const value = raw.trim().toUpperCase();
  if (!/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(value)) return null;
  if (value.includes('.')) return value;
  if (/^(4|8|92)/.test(value)) return `${value}.BJ`;
  if (/^(5|6|9)/.test(value)) return `${value}.SH`;
  return `${value}.SZ`;
}

function renderSuggestions() {
  controls.stockSuggestions.replaceChildren();
  controls.stockSuggestions.classList.toggle('hidden', !suggestions.length);
  suggestions.forEach((stock) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    const name = document.createElement('span');
    name.className = 'suggestion__name';
    name.textContent = stock.name;
    const code = document.createElement('span');
    code.className = 'suggestion__code';
    code.textContent = stock.code;
    const pinyin = document.createElement('span');
    pinyin.className = 'suggestion__pinyin';
    pinyin.textContent = stock.pinyin;
    button.append(name, code, pinyin);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => addStock(stock.code));
    controls.stockSuggestions.append(button);
  });
}

async function runStockSearch(query) {
  const sequence = ++searchSequence;
  try {
    const results = await window.ghost.searchStocks(query);
    if (sequence !== searchSequence) return;
    suggestions = results.filter((item) => !config.stocks.includes(item.code));
    renderSuggestions();
  } catch (error) {
    if (sequence !== searchSequence) return;
    suggestions = [];
    renderSuggestions();
    controls.saveStatus.textContent = `搜索暂不可用，仍可直接输入代码：${error.message}`;
  }
}

if (isSettings) {
  controls.stockCode.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = controls.stockCode.value.trim();
    if (!query) {
      suggestions = [];
      renderSuggestions();
      return;
    }
    searchTimer = setTimeout(() => runStockSearch(query), 220);
  });
  controls.stockCode.addEventListener('blur', () => setTimeout(() => {
    suggestions = [];
    renderSuggestions();
  }, 160));

  controls.stockForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (suggestions[0]) {
      addStock(suggestions[0].code);
      return;
    }
    const code = normalizeDirectCode(controls.stockCode.value);
    if (!code) {
      controls.saveStatus.textContent = '请选择搜索结果，或输入正确的 6 位股票代码';
      return;
    }
    addStock(code);
  });

  ['fontSize', 'opacity', 'upColor', 'downColor', 'flatColor'].forEach((id) => {
    controls[id].addEventListener('input', updateOutputs);
  });
  controls.dataSource.addEventListener('change', updateSourceHint);
  controls.shortcut.addEventListener('keydown', (event) => {
    event.preventDefault();
    const value = acceleratorFromEvent(event);
    if (value.split('+').length >= 2) controls.shortcut.value = value;
  });

  controls.testToken.addEventListener('click', async () => {
    controls.testToken.disabled = true;
    controls.tokenStatus.textContent = '正在测试行情链路…';
    const result = await window.ghost.testToken({
      token: controls.token.value,
      dataSource: controls.dataSource.value
    });
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
        dataSource: controls.dataSource.value,
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
      controls.saveStatus.textContent = '已保存，正在刷新行情';
      setTimeout(() => window.ghost.closeSettings(), 450);
    } catch (error) {
      controls.saveStatus.textContent = error.message;
    } finally {
      controls.save.disabled = false;
    }
  });
  controls.closeSettings.addEventListener('click', () => window.ghost.closeSettings());
}

window.ghost.onConfig((value) => {
  config = { ...config, ...value };
  applyAppearance(config);
  if (isSettings) populateSettings();
});
window.ghost.onQuotes((value) => {
  quoteState = value;
  if (isSettings) renderDataHealth();
  else renderTicker();
});

window.ghost.getConfig().then((value) => {
  config = value;
  applyAppearance(config);
  if (isSettings) populateSettings();
  else renderTicker();
});
