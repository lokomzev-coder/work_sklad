/**
 * Блок L — one-time CLI to create THE single owner (isOwner: true)
 * platform admin. Deliberately NOT a UI/route — a registration form for an
 * account with unconditional full access to every organization's data
 * would itself be the biggest hole in this whole block. Run manually:
 *
 *   npx tsx scripts/create-platform-owner.ts
 *
 * Additional (non-owner) platform admins are created from inside the
 * panel itself once the owner is logged in (Block L phase 2/4) — this
 * script only ever runs once per deployment, and refuses to run again if
 * an owner already exists.
 */
// Must run before importing lib/prisma below — unlike `next dev` (which
// loads .env automatically as part of its own bootstrap) and unlike the
// Prisma CLI (prisma.config.ts does this same import for its own commands),
// a plain `tsx` script has nothing loading .env for it at all. Without
// this, process.env.DATABASE_URL is undefined when lib/prisma.ts's
// module-level pg.Pool() reads it, and `pg` silently falls back to
// OS-level Postgres defaults (or a stray local Postgres install) instead
// of erroring clearly — which is what actually produced the confusing
// EACCES here, not the documented prisma-dev two-process race this
// project has run into elsewhere (that one is intermittent; this one was
// 100% reproducible, which is the tell).
import "dotenv/config";

import readline from "node:readline";
import bcrypt from "bcryptjs";
import * as QRCode from "qrcode";
import { TOTP, Secret } from "otpauth";
import { prisma } from "../src/lib/prisma";
import { encryptWithMasterKey } from "../src/lib/crypto";
import { getAdminBasePath } from "../src/lib/admin-path";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Control characters this needs to recognize in raw-mode stdin, compared
// by numeric char code rather than string literal — an embedded raw
// control byte in the source is invisible and easy to corrupt with
// ordinary text tools, so this avoids putting one in the file at all.
const CODE_ENTER_LF = 10;
const CODE_ENTER_CR = 13;
const CODE_CTRL_C = 3;
const CODE_BACKSPACE_DEL = 127;
const CODE_BACKSPACE_BS = 8;

/** Reads a line without echoing it back — same approach as most Node CLI
 * password prompts (no readline built-in for this, so raw mode + manual
 * asterisk echo). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    let input = "";
    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      if (code === CODE_ENTER_LF || code === CODE_ENTER_CR) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (code === CODE_CTRL_C) {
        stdin.setRawMode(false);
        process.exit(1);
      }
      if (code === CODE_BACKSPACE_DEL || code === CODE_BACKSPACE_BS) {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      input += char;
      process.stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const existingOwner = await prisma.platformAdmin.findFirst({ where: { isOwner: true } });
  if (existingOwner) {
    console.error(
      `Головной аккаунт уже существует (${existingOwner.email}). Этот скрипт создаёт только ОДИН такой аккаунт и отказывается работать повторно — остальных платформенных админов заводите из самой панели.`,
    );
    process.exit(1);
  }

  console.log("=== Создание головного аккаунта панели разработчика ===\n");
  const email = (await ask("Email: ")).toLowerCase();
  const name = await ask("Имя: ");
  const password = await askHidden("Пароль (не короче 12 символов): ");
  if (password.length < 12) {
    console.error("Пароль слишком короткий (минимум 12 символов).");
    process.exit(1);
  }
  const passwordConfirm = await askHidden("Повторите пароль: ");
  if (password !== passwordConfirm) {
    console.error("Пароли не совпадают.");
    process.exit(1);
  }

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: "WorkSklad Admin", label: email, secret });
  console.log("\nОтсканируйте этот QR-код в приложении-аутентификаторе (Google Authenticator и т.п.):\n");
  console.log(await QRCode.toString(totp.toString(), { type: "terminal", small: true }));
  console.log(`Если не можете отсканировать — введите вручную: ${secret.base32}\n`);

  const confirmCode = await ask("Введите код из приложения, чтобы подтвердить настройку: ");
  const delta = totp.validate({ token: confirmCode.trim(), window: 1 });
  if (delta === null) {
    console.error("Код не подошёл. Запустите скрипт заново.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { wrapped, nonce } = encryptWithMasterKey(secret.base32);

  const admin = await prisma.platformAdmin.create({
    data: {
      email,
      name,
      passwordHash,
      isOwner: true,
      totpSecretEnc: wrapped,
      totpSecretNonce: nonce,
      totpEnabledAt: new Date(),
    },
  });

  console.log(`\nГотово. Головной аккаунт создан: ${admin.email}. Войдите на ${getAdminBasePath()}/login.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
