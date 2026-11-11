"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Invisible Cloudflare Turnstile. Render `widget` inside the form and call
 * `getToken()` right before submitting; call `reset()` after each attempt,
 * because tokens are single-use.
 */
export function useTurnstile() {
  const ref = useRef<TurnstileInstance | undefined>(undefined);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!SITE_KEY || !ref.current) return undefined;
    const existing = ref.current.getResponse();
    if (existing) return existing;
    try {
      return await ref.current.getResponsePromise(30_000);
    } catch {
      return undefined;
    }
  }, []);

  const reset = useCallback(() => ref.current?.reset(), []);

  const widget = SITE_KEY ? (
    <Turnstile
      ref={ref}
      siteKey={SITE_KEY}
      options={{ size: "invisible", theme: "auto" }}
      className="hidden"
    />
  ) : null;

  return { widget, getToken, reset };
}
