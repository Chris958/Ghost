const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCode, calculateChange, rowsFromTushare } = require('../src/core.cjs');

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
