import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const IMPORT_DIR = path.join(process.cwd(), ".data", "imports");
const TOKEN_RE = /^[a-f0-9-]{36}$/;

function safePath(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null;
  const file = path.join(IMPORT_DIR, `${token}.xlsx`);
  return file.startsWith(IMPORT_DIR + path.sep) ? file : null;
}

export async function saveImportFile(token: string, buffer: Buffer): Promise<void> {
  const file = safePath(token);
  if (!file) throw new Error("invalid token");
  await mkdir(IMPORT_DIR, { recursive: true });
  await writeFile(/* turbopackIgnore: true */ file, buffer);
}

export async function readImportFile(token: string): Promise<Buffer | null> {
  const file = safePath(token);
  if (!file) return null;
  try {
    return await readFile(/* turbopackIgnore: true */ file);
  } catch {
    return null;
  }
}

export async function deleteImportFile(token: string): Promise<void> {
  const file = safePath(token);
  if (!file) return;
  await unlink(/* turbopackIgnore: true */ file).catch(() => undefined);
}
