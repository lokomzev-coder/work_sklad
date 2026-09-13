import { chromium, type Browser } from "playwright";

const globalForPdfBrowser = globalThis as unknown as {
  pdfBrowserPromise: Promise<Browser> | undefined;
};

/**
 * Block M4 phase B — one headless Chromium process per server process,
 * reused across requests (launching takes real seconds, not something to
 * pay on every print) — same singleton-via-globalThis idea as lib/prisma.ts,
 * surviving Next.js dev's module reloads. Unlike prisma's PGlite, there's no
 * hard one-connection ceiling here: multiple contexts/pages can render
 * concurrently against a single Browser instance.
 *
 * The cached PROMISE (not the resolved Browser) is what's stored, so
 * concurrent first-callers await the same in-flight launch instead of each
 * starting their own. If the browser process later dies (crash, OOM, killed
 * externally) or the initial launch itself fails (e.g. `npx playwright
 * install chromium` was never run on this machine — see
 * docs/handbook/deployment.md), the cached promise is dropped so the NEXT
 * request retries instead of every future request erroring against a dead
 * handle forever.
 */
export function getPdfBrowser(): Promise<Browser> {
  if (!globalForPdfBrowser.pdfBrowserPromise) {
    const promise = chromium.launch({ headless: true });
    promise
      .then((browser) => {
        browser.on("disconnected", () => {
          if (globalForPdfBrowser.pdfBrowserPromise === promise) {
            globalForPdfBrowser.pdfBrowserPromise = undefined;
          }
        });
      })
      .catch(() => {
        if (globalForPdfBrowser.pdfBrowserPromise === promise) {
          globalForPdfBrowser.pdfBrowserPromise = undefined;
        }
      });
    globalForPdfBrowser.pdfBrowserPromise = promise;
  }
  return globalForPdfBrowser.pdfBrowserPromise;
}
