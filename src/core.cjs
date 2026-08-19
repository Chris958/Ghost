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

module.exports = { normalizeCode, calculateChange, rowsFromTushare };
