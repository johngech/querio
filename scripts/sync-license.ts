/**
 * Copies the repo root LICENSE into every published package directory so each
 * package tarball carries its own license. Run with `bun run sync-license`;
 * the root `prebuild` hook invokes it automatically before `bun run build`.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = import.meta.dir ? join(import.meta.dir, '..') : process.cwd();
const source = join(root, 'LICENSE');
const licenseText = readFileSync(source, 'utf8');
const packages = ['core', 'prisma', 'drizzle', 'typeorm'];

for (const pkg of packages) {
  const dir = join(root, 'packages', pkg);
  mkdirSync(dir, { recursive: true });
  copyFileSync(source, join(dir, 'LICENSE'));
  console.log(`synced LICENSE -> packages/${pkg}/LICENSE`);
}

if (licenseText.length === 0) {
  throw new Error('Root LICENSE is empty; refusing to propagate.');
}
