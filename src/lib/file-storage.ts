import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";

// Block O phase 8 — local filesystem storage for uploaded files (product
// images, document attachments). Deliberately NOT under `public/`: Next.js
// serves that directory statically with no auth check at all, which would
// make every org's files reachable by anyone who guesses a URL in this
// multi-tenant app. Files live here instead and are only ever reachable
// through the authenticated /api/files/[id] route, which checks the
// requesting user's org membership against the Attachment row first.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "uploads");

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export interface SavedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Saves an uploaded File under storage/uploads/<orgId>/<random>.<ext> — the
 * on-disk name is never the user-supplied one (avoids path traversal and
 * collisions entirely); the original name is kept only in Attachment.fileName
 * for display/download.
 */
export async function saveUploadedFile(orgId: string, file: File): Promise<SavedFile> {
  const orgDir = path.join(STORAGE_ROOT, orgId);
  await mkdir(orgDir, { recursive: true });

  const ext = path.extname(file.name).slice(0, 10);
  const diskName = `${randomUUID()}${ext}`;
  const absolutePath = path.join(orgDir, diskName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    storagePath: path.join(orgId, diskName),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(path.join(STORAGE_ROOT, storagePath));
}

/** Best-effort — a missing file on disk (already deleted, or a dev-env
 * reset that wiped `storage/` without touching the DB) shouldn't block the
 * Attachment row's own deletion. */
export async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await unlink(path.join(STORAGE_ROOT, storagePath));
  } catch {
    // already gone — nothing to do
  }
}
