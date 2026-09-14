import path from "node:path";

/**
 * Security fix (external review, 2026-09-13) — the only thing standing
 * between an uploaded file and stored XSS. Previously `uploadAttachment`
 * accepted any file type, and `/api/files/[id]` served it back with
 * `Content-Type: <client-supplied file.type>` + `Content-Disposition:
 * inline` — an attacker could upload `evil.html` with `Content-Type:
 * text/html` and have it render (and execute) in this app's own origin
 * when a colleague opened the "attachment".
 *
 * Two independent layers, deliberately not relying on either alone:
 *  1. `saveUploadedFile` rejects any extension not in this table at
 *     upload time (see lib/file-storage.ts).
 *  2. `/api/files/[id]/route.ts` NEVER trusts `Attachment.mimeType` (a
 *     client-supplied value stored in the DB) for the response
 *     `Content-Type` — it re-derives both the Content-Type and whether
 *     `inline` is even allowed from THIS table, keyed by extension, at
 *     serve time. Layer 2 is the real boundary: even a file that somehow
 *     got stored with a mismatched extension/content is neutralized here,
 *     since anything not recognized falls back to a forced download of
 *     `application/octet-stream` — never rendered in-origin.
 *
 * `inline: true` is reserved for types with no script-execution surface
 * in a browser tab (images, PDF). Everything else — including plain text
 * and CSV, which some browsers will still sniff/render — downloads
 * instead of opening in-origin.
 */
export const UPLOAD_ALLOWLIST: Record<string, { mime: string; inline: boolean }> = {
  ".jpg": { mime: "image/jpeg", inline: true },
  ".jpeg": { mime: "image/jpeg", inline: true },
  ".png": { mime: "image/png", inline: true },
  ".gif": { mime: "image/gif", inline: true },
  ".webp": { mime: "image/webp", inline: true },
  ".pdf": { mime: "application/pdf", inline: true },
  ".doc": { mime: "application/msword", inline: false },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inline: false,
  },
  ".xls": { mime: "application/vnd.ms-excel", inline: false },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inline: false,
  },
  ".csv": { mime: "text/csv", inline: false },
  ".txt": { mime: "text/plain", inline: false },
};

export function resolveUploadType(fileName: string): { ext: string; mime: string; inline: boolean } | null {
  const ext = path.extname(fileName).toLowerCase();
  const entry = UPLOAD_ALLOWLIST[ext];
  return entry ? { ext, ...entry } : null;
}
