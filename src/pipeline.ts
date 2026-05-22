// ============================================================
// pipeline.ts — Order Lifecycle Pipeline (core data layer)
// ============================================================

import { supabase }                  from './supabaseClient.js';
import { assertTransitionAllowed }   from './stateMachine.js';
import {
  Order,
  OrderStatus,
  PipelineResult,
  TransitionAuditLog,
  TERMINAL_STATES,
} from './types.js';

// ── Constants ────────────────────────────────────────────────

const ORDERS_TABLE    = 'orders'      as const;
const AUDIT_LOG_TABLE = 'order_audit_logs' as const;

// ── Internal helpers ─────────────────────────────────────────

/**
 * Resolves the current status of an order from the DB.
 * Throws if the order does not exist.
 */
async function fetchOrderById(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .eq('id', orderId)
    .single();

  if (error || !data) {
    throw new Error(
      `[Pipeline] Order "${orderId}" not found. ` +
      (error?.message ?? 'No record returned.'),
    );
  }

  return data as Order;
}

/**
 * Writes an immutable audit entry for every status change.
 * Failures are logged but intentionally do NOT roll back the
 * primary transition — use a DB trigger for guaranteed durability.
 */
async function writeAuditLog(entry: TransitionAuditLog): Promise<void> {
  const { error } = await supabase
    .from(AUDIT_LOG_TABLE)
    .insert(entry);

  if (error) {
    // Non-fatal: surface as a warning so observability tooling can alert.
    console.warn(
      `[Pipeline] Audit log write failed for order "${entry.order_id}":`,
      error.message,
    );
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Fetches all orders that are NOT in a terminal state,
 * sorted oldest-first (FIFO processing order).
 *
 * "Active" = Pending | Confirmed | Shipped
 */
export async function fetchActiveOrders(): Promise<PipelineResult<Order[]>> {
  try {
    const activeStatuses: OrderStatus[] = Object.values(OrderStatus).filter(
      (s) => !TERMINAL_STATES.has(s),
    );

    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select('*')
      .in('status', activeStatuses)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`[fetchActiveOrders] Supabase query failed: ${error.message}`);
    }

    return { data: (data ?? []) as Order[], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { data: null, error: message };
  }
}

/**
 * The central state-transition function.
 *
 * 1. Validates the transition against the state machine.
 * 2. Issues an atomic UPDATE (with optimistic-lock on current status).
 * 3. Writes an audit log entry.
 *
 * The optimistic lock (`eq('status', currentStatus)`) ensures that a
 * concurrent update that already moved the order cannot be silently
 * overwritten — the UPDATE will match 0 rows and we surface the conflict.
 */
export async function transitionOrderStatus(
  orderId:       string,
  currentStatus: OrderStatus,
  targetStatus:  OrderStatus,
  reason?:       string,
): Promise<PipelineResult<Order>> {
  try {
    // ── 1. Guard ─────────────────────────────────────────────
    assertTransitionAllowed(currentStatus, targetStatus, orderId);

    // ── 2. Atomic UPDATE with optimistic concurrency lock ────
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .update({ status: targetStatus, updated_at: now })
      .eq('id', orderId)
      .eq('status', currentStatus)   // ← optimistic lock
      .select()
      .single();

    if (error) {
      throw new Error(
        `[transitionOrderStatus] DB update failed for order "${orderId}": ${error.message}`,
      );
    }

    if (!data) {
      // 0 rows matched → concurrent update already moved the status.
      throw new Error(
        `[transitionOrderStatus] Optimistic lock conflict on order "${orderId}". ` +
        `Expected status "${currentStatus}" but it may have changed. ` +
        `Re-fetch the order and retry.`,
      );
    }

    // ── 3. Audit log ─────────────────────────────────────────
    await writeAuditLog({
      order_id:         orderId,
      from_status:      currentStatus,
      to_status:        targetStatus,
      transitioned_at:  now,
      ...(reason !== undefined && { reason }),
    });

    return { data: data as Order, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { data: null, error: message };
  }
}

/**
 * processRTO — Return to Origin
 *
 * Marks a `Shipped` order as `Returned`.
 * This is the only legal path into `Returned` status.
 *
 * Validates the order's *live* status from the DB before transitioning
 * so callers don't need to supply currentStatus manually.
 */
export async function processRTO(orderId: string): Promise<PipelineResult<Order>> {
  try {
    const order = await fetchOrderById(orderId);

    if (order.status !== OrderStatus.Shipped) {
      throw new Error(
        `[processRTO] RTO is only valid for orders in "Shipped" status. ` +
        `Order "${orderId}" is currently "${order.status}".`,
      );
    }

    return transitionOrderStatus(
      orderId,
      OrderStatus.Shipped,
      OrderStatus.Returned,
      'RTO — failed delivery, returned to origin',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { data: null, error: message };
  }
}

/**
 * cancelOrder — Customer / ops cancellation
 *
 * Only `Pending` orders may be cancelled via this helper.
 * Cancelling a `Confirmed` or later order requires an explicit call to
 * `transitionOrderStatus` with business-level authorization — a deliberate
 * friction point to prevent accidental cancellations mid-fulfillment.
 */
export async function cancelOrder(orderId: string): Promise<PipelineResult<Order>> {
  try {
    const order = await fetchOrderById(orderId);

    if (order.status !== OrderStatus.Pending) {
      throw new Error(
        `[cancelOrder] Only "Pending" orders can be cancelled via this function. ` +
        `Order "${orderId}" is currently "${order.status}". ` +
        `Use transitionOrderStatus() directly for post-confirmation cancellations.`,
      );
    }

    return transitionOrderStatus(
      orderId,
      OrderStatus.Pending,
      OrderStatus.Cancelled,
      'customer_cancellation',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { data: null, error: message };
  }
}
