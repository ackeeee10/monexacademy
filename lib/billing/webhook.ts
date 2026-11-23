import "server-only";

import type { webhooks } from "@polar-sh/sdk/2026-10";
import type { SupabaseClient } from "@supabase/supabase-js";

import { catalogByProductId } from "./catalog";

type Event = Awaited<ReturnType<typeof webhooks.validateEvent>>;
type OrderEvent = Extract<Event, { type: "order.paid" | "order.refunded" }>;
type SubscriptionEvent = Extract<
  Event,
  { type: "subscription.active" | "subscription.updated" | "subscription.canceled" | "subscription.revoked" | "subscription.created" | "subscription.uncanceled" }
>;

/** An event that is valid but has nothing for us to do; it isn't retried. */
export class IgnoredEvent extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Our user id: set as the Polar customer's external id at checkout (metadata as a fallback). */
function userIdOf(customerExternalId: string | null | undefined, metadata: Record<string, unknown> | undefined): string {
  const candidate = customerExternalId ?? (typeof metadata?.user_id === "string" ? metadata.user_id : null);
  if (!candidate || !UUID.test(candidate)) throw new IgnoredEvent("no user id");
  return candidate;
}

async function rpc(admin: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await admin.rpc(fn, args);
  if (!error) return;
  if (error.message.includes("user_not_found")) throw new IgnoredEvent("user not found");
  throw new Error(`${fn}: ${error.message}`);
}

async function onOrderPaid(admin: SupabaseClient, order: OrderEvent["data"]) {
  const item = catalogByProductId(order.product_id);
  if (!item) throw new IgnoredEvent(`unknown product ${order.product_id}`);
  const userId = userIdOf(order.customer?.external_id, order.metadata as Record<string, unknown>);
  await rpc(admin, "billing_apply_order", {
    p_user: userId,
    p_order: {
      id: order.id,
      kind: item.kind,
      product_key: item.key,
      product_id: order.product_id,
      credits: item.kind === "credits" ? item.credits : 0,
      plan: item.kind === "subscription" ? item.plan : null,
      interval: item.kind === "subscription" ? item.interval : null,
      subscription_id: order.subscription_id,
      amount_cents: order.net_amount,
      currency: order.currency,
      billing_reason: order.billing_reason,
      status: order.status,
    },
  });
}

async function onOrderRefunded(admin: SupabaseClient, order: OrderEvent["data"]) {
  await rpc(admin, "billing_apply_refund", {
    p_order_id: order.id,
    p_refunded_cents: order.refunded_amount,
    p_status: order.status,
  });
}

async function onSubscription(admin: SupabaseClient, sub: SubscriptionEvent["data"]) {
  const item = catalogByProductId(sub.product_id);
  if (!item || item.kind !== "subscription") throw new IgnoredEvent(`unknown plan product ${sub.product_id}`);
  const userId = userIdOf(sub.customer?.external_id, sub.metadata as Record<string, unknown>);
  await rpc(admin, "billing_upsert_subscription", {
    p_user: userId,
    p_sub: {
      id: sub.id,
      customer_id: sub.customer_id,
      product_id: sub.product_id,
      plan: item.plan,
      interval: sub.recurring_interval === "year" ? "year" : "month",
      status: sub.status,
      trial_end: sub.trial_end,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      ended_at: sub.ended_at,
      modified_at: sub.modified_at ?? sub.created_at,
    },
  });
}

/** Applies one verified Polar event to the database. */
export async function handlePolarEvent(admin: SupabaseClient, event: Event): Promise<void> {
  switch (event.type) {
    case "order.paid":
      return onOrderPaid(admin, event.data);
    case "order.refunded":
      return onOrderRefunded(admin, event.data);
    case "subscription.created":
    case "subscription.active":
    case "subscription.updated":
    case "subscription.canceled":
    case "subscription.uncanceled":
    case "subscription.revoked":
      return onSubscription(admin, event.data);
    default:
      throw new IgnoredEvent(`not handled: ${event.type}`);
  }
}
