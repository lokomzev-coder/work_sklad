import { NextResponse, type NextRequest } from "next/server";
import { getPdfBrowser } from "@/lib/print/pdf-browser";
import { getInternalAppOrigin } from "@/lib/print/internal-origin";

export const dynamic = "force-dynamic";

/**
 * Block M4 phase B — renders one of the existing `/print/**` HTML pages to
 * PDF server-side via a headless, singleton Chromium (lib/print/pdf-
 * browser.ts) instead of relying on the caller's own browser print dialog.
 * Called only from `PrintDialog`'s "Скачать PDF" button (same-origin fetch,
 * so the caller's own org session cookie rides along on the request to
 * THIS route automatically) — that cookie is then re-forwarded into the
 * headless browser's own context so the target `/print/**` page sees the
 * same authenticated session and applies its own `getOrgContext`/`can()`
 * checks exactly as it would for a normal visit. This route adds no access
 * control of its own beyond that forwarding — the target page is the one
 * source of truth for who can see it.
 *
 * `path` is a query param, never a full URL — see resolveSafePrintUrl for
 * why the naive `new URL(path, origin)` construction would itself be an
 * SSRF hole if `path` weren't validated first.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Не указан path" }, { status: 400 });
  }

  const targetUrl = resolveSafePrintUrl(path);
  if (!targetUrl) {
    return NextResponse.json({ error: "Недопустимый path" }, { status: 400 });
  }

  const sessionCookies = request.cookies.getAll().filter((c) => c.name.endsWith("session-token"));
  if (sessionCookies.length === 0) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const browser = await getPdfBrowser();
  const context = await browser.newContext();
  try {
    await context.addCookies(
      sessionCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: targetUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
        secure: targetUrl.protocol === "https:",
      })),
    );

    const page = await context.newPage();
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });

    // The target page redirected us away (getOrgContext's own
    // redirect("/login")/redirect("/org-select") for a missing/stale
    // session, or notFound() elsewhere) — rendering that as a "PDF" would be
    // a confusing silent failure, so surface it as an explicit error
    // instead of a bogus document.
    const landedPath = new URL(page.url()).pathname;
    if (landedPath !== targetUrl.pathname) {
      return NextResponse.json({ error: "Не авторизовано или документ не найден" }, { status: 403 });
    }

    // Waits for the labels page's own barcode SVGs (drawn client-side by
    // jsbarcode, see print-labels.tsx) to finish — a no-op wait (condition
    // already true) on every other print page, which has no such elements.
    await page.waitForFunction(() => !document.querySelector("svg[data-barcode]:not([data-rendered])"), {
      timeout: 10_000,
    });

    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${suggestFilename(targetUrl.pathname)}"`,
      },
    });
  } finally {
    await context.close();
  }
}

function suggestFilename(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return `${parts.slice(1).join("-") || "document"}.pdf`;
}

/**
 * Only ever returns a URL on `getInternalAppOrigin()` whose path is under
 * `/print/` — rejects anything else, including inputs crafted to make
 * `new URL(path, origin)` ignore `origin` entirely (an absolute URL, or a
 * protocol-relative "//host/..." path), which is the actual SSRF this
 * exists to close: without this check, `path=https://evil.internal/admin`
 * would resolve to that absolute URL and `origin` would be silently
 * discarded by the URL constructor.
 */
function resolveSafePrintUrl(rawPath: string): URL | null {
  if (!rawPath.startsWith("/print/") || rawPath.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawPath)) return null;

  let origin: string;
  try {
    origin = getInternalAppOrigin();
  } catch {
    return null;
  }

  const resolved = new URL(rawPath, origin);
  if (resolved.origin !== new URL(origin).origin || !resolved.pathname.startsWith("/print/")) {
    return null;
  }
  return resolved;
}
