import test from 'node:test';
import assert from 'node:assert/strict';
import {num,validDate} from '../src/validators.js';
test('blank, missing and boolean numeric values never become grades',()=>{
  for(const v of ['', '  ', null, undefined, true, false])assert.equal(num(v),null);
  assert.equal(num('0'),0);assert.equal(num('12.5'),12.5);
});
test('calendar validation rejects impossible dates',()=>{
  for(const v of ['2026-02-29','2026-04-31','2026-13-01','2026-00-10','garbage'])assert.equal(validDate(v),false);
  assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-09-14'),true);
});
