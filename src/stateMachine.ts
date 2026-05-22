// ============================================================
// stateMachine.ts — Allowed-transition config & guard logic
// ============================================================

import { OrderStatus, TERMINAL_STATES } from './types.js';

/**
 * Adjacency map of the Order lifecycle state machine.
 *
 * Key   → current status
 * Value → set of statuses the order is legally allowed to move INTO
 *
 *  Pending ──► Confirmed
 *           └► Cancelled
 *  Confirmed ► Shipped
 *            └► Cancelled
 *  Shipped ──► Delivered
 *           └► Returned   (RTO)
 *  Delivered, Cancelled, Returned  →  (terminal — no outgoing edges)
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  [OrderStatus.Pending]: new Set([
    OrderStatus.Confirmed,
    OrderStatus.Cancelled,
  ]),
  [OrderStatus.Confirmed]: new Set([
    OrderStatus.Shipped,
    OrderStatus.Cancelled,
  ]),
  [OrderStatus.Shipped]: new Set([
    OrderStatus.Delivered,
    OrderStatus.Returned,
  ]),
  // Terminal nodes — empty sets enforce "no exit"
  [OrderStatus.Delivered]: new Set(),
  [OrderStatus.Cancelled]: new Set(),
  [OrderStatus.Returned]:  new Set(),
};

// ── Guards ──────────────────────────────────────────────────

/**
 * Returns `true` when `from → to` is a defined edge in the state machine.
 */
export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Throws a descriptive `Error` when the transition is illegal.
 * Call this before any DB write to keep the DB layer clean.
 */
export function assertTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  orderId: string,
): void {
  if (from === to) {
    throw new Error(
      `[StateMachine] Order "${orderId}": transition is a no-op — ` +
      `status is already "${from}".`,
    );
  }

  if (TERMINAL_STATES.has(from)) {
    throw new Error(
      `[StateMachine] Order "${orderId}": status "${from}" is terminal. ` +
      `No further transitions are permitted.`,
    );
  }

  if (!isTransitionAllowed(from, to)) {
    const allowed = [...ALLOWED_TRANSITIONS[from]].join(', ') || 'none';
    throw new Error(
      `[StateMachine] Order "${orderId}": transition "${from}" → "${to}" is not allowed. ` +
      `Valid next states from "${from}": [${allowed}].`,
    );
  }
}
