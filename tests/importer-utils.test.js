const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveImportWindowDays, calculateDuplicateScore } = require('../importer-utils');

test('defaults to a 30-day window when no value is supplied', () => {
  assert.equal(resolveImportWindowDays(), 30);
  assert.equal(resolveImportWindowDays(''), 30);
});

test('accepts a configured import window and clamps invalid values', () => {
  assert.equal(resolveImportWindowDays('45'), 45);
  assert.equal(resolveImportWindowDays('0'), 30);
  assert.equal(resolveImportWindowDays('-10'), 30);
});

test('treats similar product titles and categories as strong duplicates', () => {
  const score = calculateDuplicateScore(
    {
      title: 'Apple iPhone 15 Pro Max',
      category: 'Mobiles',
      description: 'New iPhone 15 Pro Max 256GB.',
      imageNames: ['iphone15.jpg']
    },
    {
      title: 'iPhone 15 Pro Max',
      category: 'Mobiles',
      description: 'New iPhone 15 Pro Max 256GB.',
      images: ['iphone15.jpg']
    }
  );

  assert.ok(score >= 0.78, `expected strong duplicate score, got ${score}`);
});
