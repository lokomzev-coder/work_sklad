import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];

// Block T (2026-09-15): temporary whole-site gate for the initial private
// test period — set MAINTENANCE_MODE=true and MAINTENANCE_ACCESS_CODE=<a
// secret> to block every visitor except devices that have separately
// visited /maintenance-access?code=<the secret> once. That endpoint sets a
// long-lived cookie; every other request without it (any URL at all,
// including deep links) is rewritten to the /maintenance banner instead of
// whatever it asked for — this runs before the admin/org-session checks
// below, so it applies to literally the whole app while active. Turning
// maintenance mode off later is just unsetting MAINTENANCE_MODE — nothing
// else in the app depends on this.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";
const MAINTENANCE_ACCESS_CODE = process.env.MAINTENANCE_ACCESS_CODE;
const MAINTENANCE_BYPASS_COOKIE = "maintenance_bypass";

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on mismatched lengths rather than comparing —
  // an early length check is the standard safe pattern here (the code's
  // length isn't the sensitive part; its contents are).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Block S — the public URL for the admin panel, configurable per
// deployment so it isn't a fixed, source-visible string every scanner/bot
// already knows to probe. This is a supplementary layer, not the real
// defense: the real defense (separate session/cookie, mandatory TOTP, rate
// limiting, getPlatformAdminContext()/assertPlatformPermission() on every
// page and action) is unchanged by this and lives in lib/admin-auth.ts/
// lib/platform-auth.ts. `src/app/admin/` itself is NOT renamed — the
// folder name isn't the secret (it's private source, not a public URL),
// only the routed-to path is.
const ADMIN_PATH = process.env.ADMIN_PATH || "/admin";

export const proxy = auth((req) => {
  const { nextUrl } = req;

  if (MAINTENANCE_MODE && MAINTENANCE_ACCESS_CODE) {
    if (nextUrl.pathname === "/maintenance-access") {
      const code = nextUrl.searchParams.get("code") ?? "";
      if (timingSafeStringEqual(code, MAINTENANCE_ACCESS_CODE)) {
        const res = NextResponse.redirect(new URL("/", nextUrl.origin));
        res.cookies.set(MAINTENANCE_BYPASS_COOKIE, MAINTENANCE_ACCESS_CODE, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        });
        return res;
      }
      return NextResponse.rewrite(new URL("/maintenance", nextUrl.origin));
    }

    const bypassCookie = req.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value ?? "";
    const hasBypass = timingSafeStringEqual(bypassCookie, MAINTENANCE_ACCESS_CODE);
    if (!hasBypass && nextUrl.pathname !== "/maintenance") {
      return NextResponse.rewrite(new URL("/maintenance", nextUrl.origin));
    }
  }

  // If a custom ADMIN_PATH is configured, the real /admin folder must stop
  // answering directly — otherwise Next's file-based router would still
  // happily serve it, and the "hidden" path would hide nothing. Returning
  // the 404 directly (not `NextResponse.rewrite(new URL("/404", ...))`) —
  // rewriting to a synthetic path with no matching page/not-found boundary
  // fell through to this app's own org-session gate further down instead
  // of ever producing a real 404 (confirmed live: it redirected to /login
  // instead), since App Router route resolution runs AFTER middleware, not
  // as part of it. A response built directly here needs no page to exist.
  if (ADMIN_PATH !== "/admin" && nextUrl.pathname.startsWith("/admin")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Блок L: /admin runs on a completely separate auth system
  // (lib/admin-auth.ts, its own "admin-session-token" cookie, its own
  // PlatformAdmin table) — never gated by the org session check below
  // (a platform admin has no org account at all, and an org session must
  // never grant any path into this panel — see lib/admin-auth.ts's own
  // comment for the full isolation reasoning). This is a cheap perimeter
  // check only (cookie presence, not validity) — the real check runs
  // again independently in every /admin/**\/page.tsx and platform server
  // action via getPlatformAdminContext()/assertPlatformPermission()
  // (lib/platform-auth.ts).
  if (nextUrl.pathname.startsWith(ADMIN_PATH)) {
    const internalPath = "/admin" + nextUrl.pathname.slice(ADMIN_PATH.length);
    // Блок L фаза 2: /admin/setup/[token] is reached by a brand-new,
    // not-yet-provisioned admin who has no session at all yet (the
    // token itself is their one-time credential for this one page) —
    // same public-path idea as /admin/login.
    const isPublic = internalPath === "/admin/login" || internalPath.startsWith("/admin/setup/");
    if (!isPublic) {
      const hasAdminSession = req.cookies.has("admin-session-token");
      if (!hasAdminSession) {
        return NextResponse.redirect(new URL(`${ADMIN_PATH}/login`, nextUrl.origin));
      }
    }
    return NextResponse.rewrite(new URL(internalPath + nextUrl.search, nextUrl.origin));
  }

  const isLoggedIn = !!req.auth;
  const isPublicPath = PUBLIC_PATHS.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  if (!isLoggedIn && !isPublicPath) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isPublicPath) {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
