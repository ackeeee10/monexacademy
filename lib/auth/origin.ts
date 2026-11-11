import "server-only";

import { headers } from "next/headers";

import { getSiteUrl } from "@/lib/site";

/**
 * Origin of the current request (production, a free Netlify branch deploy
 * like https://dev--monexacademy.netlify.app, or localhost), so links in
 * auth emails send people back to the same site they came from.
 * Only known hosts are trusted; Supabase also checks every redirect URL
 * against its own allow-list.
 */
const TRUSTED_HOST = /^(?:[a-z0-9-]+--)?monexacademy\.netlify\.app$|^localhost(?::\d+)?$/;

export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (TRUSTED_HOST.test(host)) {
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return getSiteUrl();
}
