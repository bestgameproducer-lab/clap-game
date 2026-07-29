import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsv } from '../lib/csv.ts';

test('exports UTF-8 CSV with escaped quotes and stable rows', () => {
  const csv = buildCsv(['姓名', '说明'], [['Anrong', '他说“你好”'], ['Zimin', 'line one\nline two']]);
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.match(csv, /"他说“你好”"/);
  assert.match(csv, /"line one\nline two"/);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('neutralizes spreadsheet formulas in string cells without changing numeric negatives', () => {
  const csv = buildCsv(['value'], [['=HYPERLINK("bad")'], [' +SUM(1,2)'], [-5]]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"' \+SUM\(1,2\)"/);
  assert.match(csv, /"-5"/);
});
