import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { resourcePool, resources } from "@/db/schema";

export const COVER_UPLOAD_DIR = path.join(process.cwd(), ".data", "covers");
export const MAX_COVER_BYTES = 4 * 1024 * 1024;

export class ResourceCoverError extends Error {}

function extensionAllowed(name: string, type: string): boolean {
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|avif)$/i.test(name);
}

export async function saveCoverUpload(file: File): Promise<{ coverUrl: string; coverSource: string }> {
  if (!file || file.size === 0) throw new ResourceCoverError("فایل تصویر انتخاب نشده است.");
  if (file.size > MAX_COVER_BYTES) {
    throw new ResourceCoverError("حجم تصویر جلد باید کمتر از ۴ مگابایت باشد.");
  }
  if (!extensionAllowed(file.name, file.type)) {
    throw new ResourceCoverError("فقط تصویر JPG، PNG، WebP یا AVIF مجاز است.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input)
      .rotate()
      .resize(600, 800, { fit: "contain", background: "#ffffff" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ResourceCoverError("تصویر جلد قابل خواندن نیست.");
  }

  await mkdir(COVER_UPLOAD_DIR, { recursive: true });
  const key = randomUUID();
  await sharp(output).toFile(path.join(COVER_UPLOAD_DIR, `${key}.webp`));
  return { coverUrl: `/api/covers/${key}`, coverSource: "upload" };
}

export async function readCoverFile(key: string): Promise<Buffer | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(key)) return null;
  try {
    return await readFile(path.join(COVER_UPLOAD_DIR, `${key}.webp`));
  } catch {
    return null;
  }
}

export async function updatePoolCover(input: {
  workspaceId: string;
  poolId: string;
  coverUrl: string;
  coverSource: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(resourcePool)
    .set({ coverUrl: input.coverUrl, coverSource: input.coverSource })
    .where(
      and(
        eq(resourcePool.id, input.poolId),
        eq(resourcePool.workspaceId, input.workspaceId),
      ),
    );
}

export async function updateResourceCover(input: {
  workspaceId: string;
  studentId: string;
  resourceId: string;
  coverUrl: string;
  coverSource: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(resources)
    .set({ coverUrl: input.coverUrl, coverSource: input.coverSource })
    .where(
      and(
        eq(resources.id, input.resourceId),
        eq(resources.studentId, input.studentId),
        eq(resources.workspaceId, input.workspaceId),
      ),
    );
}
