const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCode,
  calculateChange,
  rowsFromTushare,
  rowsFromSina,
  rowsFromEastmoney,
  searchResultsFromEastmoney
} = require('../src/core.cjs');

test('normalizes common A-share codes', () => {
  assert.equal(normalizeCode('600519'), '600519.SH');
  assert.equal(normalizeCode('000001'), '000001.SZ');
  assert.equal(normalizeCode('832000'), '832000.BJ');
  assert.equal(normalizeCode('300750.sz'), '300750.SZ');
});

test('rejects invalid stock codes', () => {
  assert.throws(() => normalizeCode('60051'), /6 位/);
  assert.throws(() => normalizeCode('ABCDEF'), /6 位/);
});

test('calculates percentage change', () => {
  assert.equal(calculateChange(11, 10), 10);
  assert.equal(calculateChange(9, 10), -10);
  assert.equal(calculateChange(10, 0), null);
});

test('maps Tushare response fields safely', () => {
  const rows = rowsFromTushare({
    code: 0,
    msg: '',
    data: {
      fields: ['ts_code', 'name', 'pre_close', 'close', 'trade_time'],
      items: [['600519.SH', '贵州茅台', 1500, 1530, '10:00:00']]
    }
  });
  assert.deepEqual(rows[0], {
    code: '600519.SH', name: '贵州茅台', change: 2, price: 1530, previousClose: 1500, tradeTime: '10:00:00'
  });
});

test('maps Tushare realtime_quote Sina snapshot', () => {
  const text = 'var hq_str_sh600519="贵州茅台,1300.000,1297.990,1292.550,1308.880,1290.500,0,0,100,1000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-08-19,10:53:52,00,";';
  const rows = rowsFromSina(text);
  assert.equal(rows[0].code, '600519.SH');
  assert.equal(rows[0].name, '贵州茅台');
  assert.equal(rows[0].price, 1292.55);
  assert.equal(rows[0].previousClose, 1297.99);
  assert.ok(rows[0].change < 0);
});

test('maps Eastmoney fallback snapshot and preserves configured market', () => {
  const rows = rowsFromEastmoney({
    data: { diff: [{ f12: '600519', f14: '贵州茅台', f2: 1530, f18: 1500, f124: 1787050800 }] }
  }, ['600519.SH']);
  assert.equal(rows[0].code, '600519.SH');
  assert.equal(rows[0].name, '贵州茅台');
  assert.equal(rows[0].change, 2);
  assert.equal(rows[0].price, 1530);
});

test('maps and deduplicates fuzzy stock search results', () => {
  const payload = {
    QuotationCodeTable: {
      Data: [
        { Code: '600519', Name: '贵州茅台', PinYin: 'GZMT', Classify: 'AStock', SecurityTypeName: '沪A' },
        { Code: '600519', Name: '贵州茅台', PinYin: 'GZMT', Classify: 'AStock', SecurityTypeName: '沪A' },
        { Code: '000001', Name: '平安银行', PinYin: 'PAYH', Classify: 'AStock', SecurityTypeName: '深A' },
        { Code: '00700', Name: '腾讯控股', PinYin: 'TXKG', Classify: 'HKStock', SecurityTypeName: '港股' }
      ]
    }
  };
  assert.deepEqual(searchResultsFromEastmoney(payload), [
    { code: '600519.SH', name: '贵州茅台', pinyin: 'GZMT' },
    { code: '000001.SZ', name: '平安银行', pinyin: 'PAYH' }
  ]);
});
