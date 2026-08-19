const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCode, calculateChange, rowsFromTushare, rowsFromSina } = require('../src/core.cjs');

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
