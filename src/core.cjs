const CODE_PATTERN = /^\d{6}(?:\.(?:SH|SZ|BJ))?$/i;

function normalizeCode(input) {
  const value = String(input || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(value)) {
    throw new Error('请输入 6 位股票代码，例如 600519 或 000001.SZ');
  }
  if (value.includes('.')) return value;

  if (/^(4|8|92)/.test(value)) return `${value}.BJ`;
  if (/^(5|6|9)/.test(value)) return `${value}.SH`;
  return `${value}.SZ`;
}

function calculateChange(close, previousClose) {
  const current = Number(close);
  const previous = Number(previousClose);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function clampFontSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return 18;
  return Math.min(42, Math.max(4, size));
}

function rowsFromTushare(payload) {
  if (!payload || payload.code !== 0) {
    throw new Error(payload?.msg || 'Tushare 返回未知错误');
  }
  const fields = payload.data?.fields || [];
  return (payload.data?.items || []).map((item) => {
    const row = Object.fromEntries(fields.map((field, index) => [field, item[index]]));
    return {
      code: row.ts_code,
      name: row.name || row.ts_code,
      change: calculateChange(row.close, row.pre_close),
      price: Number(row.close),
      previousClose: Number(row.pre_close),
      tradeTime: row.trade_time || ''
    };
  });
}

function rowsFromSina(text) {
  const rows = [];
  const pattern = /var hq_str_(sh|sz|bj)(\d+)="([^"]*)";/gi;
  for (const match of String(text || '').matchAll(pattern)) {
    const market = match[1].toUpperCase();
    const code = match[2];
    const fields = match[3].split(',');
    if (!fields[0] || fields.length < 32) continue;
    const previousClose = Number(fields[2]);
    const rawPrice = Number(fields[3]);
    const price = rawPrice > 0 ? rawPrice : previousClose;
    rows.push({
      code: `${code}.${market}`,
      name: fields[0],
      change: calculateChange(price, previousClose),
      price,
      previousClose,
      tradeTime: [fields[30], fields[31]].filter(Boolean).join(' ')
    });
  }
  return rows;
}

function rowsFromEastmoney(payload, stocks) {
  const suffixByCode = new Map(stocks.map((code) => [code.slice(0, 6), code.slice(7)]));
  return (payload?.data?.diff || []).flatMap((item) => {
    const digits = String(item.f12 || '').padStart(6, '0');
    const suffix = suffixByCode.get(digits);
    if (!suffix) return [];
    const price = Number(item.f2);
    const previousClose = Number(item.f18);
    if (!Number.isFinite(price) || !Number.isFinite(previousClose)) return [];
    return [{
      code: `${digits}.${suffix}`,
      name: item.f14 || digits,
      change: calculateChange(price, previousClose),
      price,
      previousClose,
      tradeTime: item.f124 ? new Date(Number(item.f124) * 1000).toISOString() : ''
    }];
  });
}

function searchResultsFromEastmoney(payload) {
  const seen = new Set();
  return (payload?.QuotationCodeTable?.Data || []).flatMap((item) => {
    const digits = String(item.Code || '');
    if (item.Classify !== 'AStock' || !/^\d{6}$/.test(digits)) return [];
    const type = String(item.SecurityTypeName || '');
    const suffix = type.includes('沪') ? 'SH' : type.includes('北') ? 'BJ' : 'SZ';
    const code = `${digits}.${suffix}`;
    if (seen.has(code)) return [];
    seen.add(code);
    return [{ code, name: item.Name || digits, pinyin: item.PinYin || '' }];
  });
}

module.exports = {
  normalizeCode,
  calculateChange,
  clampFontSize,
  rowsFromTushare,
  rowsFromSina,
  rowsFromEastmoney,
  searchResultsFromEastmoney
};
