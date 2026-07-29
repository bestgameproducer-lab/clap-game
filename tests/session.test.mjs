import assert from 'node:assert/strict';
import test from 'node:test';
import { isFourDigitClaimCode } from '../lib/claim-code.ts';

test('accepts exactly four ASCII digits for a guest claim code', () => {
  assert.equal(isFourDigitClaimCode('0123'), true);
  assert.equal(isFourDigitClaimCode('123'), false);
  assert.equal(isFourDigitClaimCode('12345'), false);
  assert.equal(isFourDigitClaimCode('12a3'), false);
  assert.equal(isFourDigitClaimCode(1234), false);
});
