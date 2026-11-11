import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

/** Paths that need a signed-in user (without locale prefix). */
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/onboarding", "/verify-2fa", "/update-password"];
/** Paths a signed-in user doesn't need. */
const GUEST_ONLY = ["/login", "/signup"];

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export default async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request, handleI18nRouting(request));
  const path = stripLocale(request.nextUrl.pathname);

  let redirectTo: URL | null = null;
  if (!userId && matches(path, PROTECTED_PREFIXES)) {
    redirectTo = new URL("/login", request.url);
    redirectTo.searchParams.set("next", path + request.nextUrl.search);
  } else if (userId && matches(path, GUEST_ONLY) && !request.nextUrl.searchParams.has("deleted")) {
    redirectTo = new URL("/dashboard", request.url);
  }

  if (!redirectTo) return response;

  // Keep any refreshed session cookies on the redirect.
  const redirect = NextResponse.redirect(redirectTo);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // All paths except API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
