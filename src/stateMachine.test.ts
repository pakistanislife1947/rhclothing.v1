// ============================================================
// stateMachine.test.ts — Unit tests (Node built-in test runner)
// Run: node --experimental-vm-modules --import tsx/esm \
//        src/stateMachine.test.ts
// ============================================================

import { describe, it } from 'node:test';
import assert            from 'node:assert/strict';

import { isTransitionAllowed, assertTransitionAllowed } from './stateMachine.js';
import { OrderStatus } from './types.js';

// ── isTransitionAllowed ──────────────────────────────────────

describe('isTransitionAllowed', () => {
  it('allows Pending → Confirmed', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Pending, OrderStatus.Confirmed));
  });

  it('allows Pending → Cancelled', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Pending, OrderStatus.Cancelled));
  });

  it('allows Confirmed → Shipped', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Confirmed, OrderStatus.Shipped));
  });

  it('allows Confirmed → Cancelled', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Confirmed, OrderStatus.Cancelled));
  });

  it('allows Shipped → Delivered', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Shipped, OrderStatus.Delivered));
  });

  it('allows Shipped → Returned (RTO)', () => {
    assert.ok(isTransitionAllowed(OrderStatus.Shipped, OrderStatus.Returned));
  });

  it('rejects Pending → Shipped (skipping Confirmed)', () => {
    assert.equal(isTransitionAllowed(OrderStatus.Pending, OrderStatus.Shipped), false);
  });

  it('rejects Delivered → Cancelled (terminal)', () => {
    assert.equal(isTransitionAllowed(OrderStatus.Delivered, OrderStatus.Cancelled), false);
  });

  it('rejects Cancelled → Pending (backward)', () => {
    assert.equal(isTransitionAllowed(OrderStatus.Cancelled, OrderStatus.Pending), false);
  });

  it('rejects Returned → Shipped (backward)', () => {
    assert.equal(isTransitionAllowed(OrderStatus.Returned, OrderStatus.Shipped), false);
  });
});

// ── assertTransitionAllowed ──────────────────────────────────

describe('assertTransitionAllowed', () => {
  it('does not throw for a valid transition', () => {
    assert.doesNotThrow(() =>
      assertTransitionAllowed(OrderStatus.Pending, OrderStatus.Confirmed, 'order-1'),
    );
  });

  it('throws a no-op error when from === to', () => {
    assert.throws(
      () => assertTransitionAllowed(OrderStatus.Pending, OrderStatus.Pending, 'order-2'),
      /no-op/,
    );
  });

  it('throws a terminal error for terminal source states', () => {
    assert.throws(
      () => assertTransitionAllowed(OrderStatus.Delivered, OrderStatus.Cancelled, 'order-3'),
      /terminal/,
    );
  });

  it('throws a descriptive error for an invalid non-terminal transition', () => {
    assert.throws(
      () => assertTransitionAllowed(OrderStatus.Pending, OrderStatus.Delivered, 'order-4'),
      /not allowed/,
    );
  });

  it('error message includes the order ID', () => {
    try {
      assertTransitionAllowed(OrderStatus.Shipped, OrderStatus.Pending, 'order-xyz');
      assert.fail('Expected error was not thrown');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('order-xyz'));
    }
  });
});
