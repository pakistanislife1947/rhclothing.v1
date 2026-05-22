// ============================================================
// types.ts — Domain types for the Order Lifecycle Pipeline
// ============================================================

export enum OrderStatus {
  Pending   = 'Pending',
  Confirmed = 'Confirmed',
  Shipped   = 'Shipped',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled',
  Returned  = 'Returned',
}

/** Terminal states — no further transitions are legal. */
export const TERMINAL_STATES = new Set<OrderStatus>([
  OrderStatus.Delivered,
  OrderStatus.Cancelled,
  OrderStatus.Returned,
]);

export interface Order {
  id: string;
  customer_id: string;
  status: OrderStatus;
  created_at: string;           // ISO-8601 timestamp
  updated_at: string;           // ISO-8601 timestamp
  metadata?: Record<string, unknown>;
}

/**
 * Result shape returned from every pipeline operation.
 * On success `data` is populated; on failure `error` carries the reason.
 */
export interface PipelineResult<T = Order> {
  data: T | null;
  error: string | null;
}

/** Payload written to the audit log on every status change. */
export interface TransitionAuditLog {
  order_id: string;
  from_status: OrderStatus;
  to_status: OrderStatus;
  transitioned_at: string;      // ISO-8601 timestamp
  reason?: string;              // e.g. "RTO", "customer_cancellation"
}
