const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveImportWindowDays, calculateDuplicateScore, chooseMeaningfulTitle, buildImportedProductGroups } = require('../importer-utils');

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

test('prefers the first meaningful title line and ignores phone numbers or system text', () => {
  assert.equal(
    chooseMeaningfulTitle(['+91 73832 34749', 'Available', 'Mi 20000mAh Super Fast Power Bank'], 'Fallback'),
    'Mi 20000mAh Super Fast Power Bank'
  );
});

test('groups consecutive related messages into one product', () => {
  const groups = buildImportedProductGroups([
    { text: 'Mi 20000mAh Super Fast Power Bank', timestamp: new Date('2026-08-01T10:00:00Z') },
    { text: 'Price ₹291', timestamp: new Date('2026-08-01T10:01:00Z') },
    { text: 'MRP ₹390', timestamp: new Date('2026-08-01T10:02:00Z') },
    { text: 'Available', timestamp: new Date('2026-08-01T10:03:00Z') }
  ], []);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Mi 20000mAh Super Fast Power Bank');
  assert.equal(groups[0].price, 291);
  assert.equal(groups[0].originalPrice, 390);
});
