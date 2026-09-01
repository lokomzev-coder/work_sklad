import { notFound } from "next/navigation";

/**
 * Vault (password manager) is hidden for now — not deleted. The user wants
 * it out of the product while deciding whether it belongs here at all or
 * should move to a separate service; the underlying models/actions/crypto
 * are untouched so this is reversible by just removing this gate.
 */
export default function VaultLayout() {
  notFound();
}
