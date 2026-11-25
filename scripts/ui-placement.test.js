'use strict';

// Hebrew/RTL Phase 2.2: where a pointer-placed menu goes, and which side of
// a book "before" is, once the interface can run right to left.

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { menuLeft, beforeMiddle, rowStep, opensBack } = require('../bidi');

describe('menuLeft', () => {
  test('left to right: opens at the pointer', () => {
    assert.equal(menuLeft(100, 200, 1000, false), 100);
  });
  test('left to right: pulled back from the right edge', () => {
    assert.equal(menuLeft(900, 200, 1000, false), 796);
  });
  test('right to left: its right edge is at the pointer', () => {
    assert.equal(menuLeft(500, 200, 1000, true), 300);
  });
  test('right to left: kept clear of the left edge', () => {
    assert.equal(menuLeft(50, 200, 1000, true), 4);
  });
  test('right to left: a pointer at the right edge still fits', () => {
    assert.equal(menuLeft(1000, 200, 1000, true), 796);
  });
  test('a menu wider than the window keeps its left edge on screen', () => {
    assert.equal(menuLeft(100, 2000, 1000, false), 4);
    assert.equal(menuLeft(100, 2000, 1000, true), 4);
  });
  test('the gap can be changed', () => {
    assert.equal(menuLeft(990, 100, 1000, false, 10), 890);
  });
});

describe('beforeMiddle', () => {
  test('left to right: before is the left half', () => {
    assert.equal(beforeMiddle(10, 0, 100, 'ltr'), true);
    assert.equal(beforeMiddle(90, 0, 100, 'ltr'), false);
  });
  test('right to left: before is the right half', () => {
    assert.equal(beforeMiddle(90, 0, 100, 'rtl'), true);
    assert.equal(beforeMiddle(10, 0, 100, 'rtl'), false);
  });
  test('anything but rtl is left to right', () => {
    assert.equal(beforeMiddle(10, 0, 100, ''), true);
    assert.equal(beforeMiddle(10, 0, 100, undefined), true);
  });
});

describe('rowStep', () => {
  test('left to right: → is next, ← previous', () => {
    assert.equal(rowStep('ArrowRight', 'ltr'), 1);
    assert.equal(rowStep('ArrowLeft', 'ltr'), -1);
  });
  test('right to left: ← is next, → previous', () => {
    assert.equal(rowStep('ArrowLeft', 'rtl'), 1);
    assert.equal(rowStep('ArrowRight', 'rtl'), -1);
  });
  test('other keys are no step', () => {
    assert.equal(rowStep('ArrowUp', 'rtl'), 0);
    assert.equal(rowStep('Enter', 'ltr'), 0);
  });
});

describe('opensBack', () => {
  // a row 0..1000, a card 200 wide growing to 400
  test('left to right: a card at the right edge opens back to the left', () => {
    assert.equal(opensBack(800, 1000, 400, 0, 1000, 'ltr'), true);
    assert.equal(opensBack(0, 200, 400, 0, 1000, 'ltr'), false);
  });
  test('right to left: a card at the left edge opens back to the right', () => {
    assert.equal(opensBack(0, 200, 400, 0, 1000, 'rtl'), true);
    assert.equal(opensBack(800, 1000, 400, 0, 1000, 'rtl'), false);
  });
  test('a few pixels of slack', () => {
    assert.equal(opensBack(602, 802, 400, 0, 1000, 'ltr'), false);
    assert.equal(opensBack(198, 398, 400, 0, 1000, 'rtl'), false);
  });
});
