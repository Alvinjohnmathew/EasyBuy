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

test('ignores generic chat messages when there is no product title', () => {
  const groups = buildImportedProductGroups([
    { text: 'Hi there, how are you?', timestamp: new Date('2026-08-01T10:00:00Z') },
    { text: 'Price ₹291', timestamp: new Date('2026-08-01T10:01:00Z') }
  ], []);

  assert.equal(groups.length, 0);
});

test('attaches multiple preceding images to the next product-text message', () => {
  const groups = buildImportedProductGroups([
    { images: ['IMG-WA0008.jpg'], timestamp: new Date('2026-08-01T09:59:00Z') },
    { images: ['IMG-WA0007.jpg'], timestamp: new Date('2026-08-01T09:59:30Z') },
    { images: ['IMG-WA0006.jpg'], timestamp: new Date('2026-08-01T09:59:50Z') },
    { text: '🔥 ONEPLUS BUDS 2R 🔥', timestamp: new Date('2026-08-01T10:00:00Z') },
    { text: 'PRICE:- 400₹', timestamp: new Date('2026-08-01T10:00:30Z') }
  ], []);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title.includes('ONEPLUS BUDS'), true);
  assert.equal(groups[0].images.length, 3);
  assert.equal(groups[0].price, 400);
});

test('does not create products for image-only messages between two products', () => {
  const groups = buildImportedProductGroups([
    { text: 'Product A name', timestamp: new Date('2026-08-01T09:00:00Z') },
    { text: 'Price ₹100', timestamp: new Date('2026-08-01T09:01:00Z') },
    { images: ['A1.jpg'], timestamp: new Date('2026-08-01T09:02:00Z') },
    { images: ['A2.jpg'], timestamp: new Date('2026-08-01T09:02:30Z') },
    { text: 'Product B name', timestamp: new Date('2026-08-01T09:10:00Z') },
    { text: 'Price ₹200', timestamp: new Date('2026-08-01T09:11:00Z') }
  ], []);

  assert.equal(groups.length, 2);
  // Because the gap before Product B is large, the images belong to Product A
  assert.equal(groups[0].title.includes('A name') || groups[0].title.includes('Product A'), true);
  assert.equal(groups[1].title.includes('B name') || groups[1].title.includes('Product B'), true);
  assert.equal(groups[0].images.length >= 2, true);
});

test('handles text-and-image in one message and merges with preceding images', () => {
  const groups = buildImportedProductGroups([
    { images: ['P1.jpg'], timestamp: new Date('2026-08-01T08:00:00Z') },
    { text: 'Super Phone', images: ['P2.jpg'], timestamp: new Date('2026-08-01T08:01:00Z') }
  ], []);

  assert.equal(groups.length, 1);
  // Both images should be present and deduplicated
  assert.equal(groups[0].images.length, 2);
  assert.equal(groups[0].title.includes('Super Phone'), true);
});

test('ignores trailing orphan images with no following product text', () => {
  const groups = buildImportedProductGroups([
    { text: 'Lonely Product', timestamp: new Date('2026-08-01T07:00:00Z') },
    { text: 'Price ₹50', timestamp: new Date('2026-08-01T07:01:00Z') },
    { images: ['orphan1.jpg'], timestamp: new Date('2026-08-01T07:10:00Z') },
    { images: ['orphan2.jpg'], timestamp: new Date('2026-08-01T07:11:00Z') }
  ], []);

  // Only the initial product should be created; orphans ignored
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title.includes('Lonely Product'), true);
});

test('prevents duplicate images when merging pending and inline images', () => {
  const groups = buildImportedProductGroups([
    { images: ['dup.jpg'], timestamp: new Date('2026-08-01T06:00:00Z') },
    { text: 'Dup Phone', images: ['dup.jpg', 'unique.jpg'], timestamp: new Date('2026-08-01T06:01:00Z') }
  ], []);

  assert.equal(groups.length, 1);
  // images should be deduplicated
  const imgs = groups[0].images;
  const uniq = Array.from(new Set(imgs));
  assert.equal(uniq.length, imgs.length);
  assert.equal(imgs.includes('dup.jpg'), true);
  assert.equal(imgs.includes('unique.jpg'), true);
});
