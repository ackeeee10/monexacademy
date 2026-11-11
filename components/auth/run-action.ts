"use client";

import type { AuthErrorKey } from "@/lib/auth/types";

type Failure = { ok: false; error: AuthErrorKey; fields?: Record<string, string> };

/** Next.js uses thrown errors with a NEXT_* digest for redirects; those must pass through. */
function isNextInternal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_")
  );
}

/**
 * Calls a Server Action and turns crashes (network loss, server error,
 * missing configuration) into a normal error result, so a form never
 * fails silently.
 */
export async function runAction<T>(call: () => Promise<T>): Promise<T | Failure> {
  try {
    return await call();
  } catch (error) {
    if (isNextInternal(error)) throw error;
    console.error("[action failed]", error);
    return { ok: false, error: "unexpected" };
  }
}
