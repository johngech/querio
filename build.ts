import { existsSync, readFileSync, rmSync } from 'node:fs';
import { $ } from 'bun';

// Clean dist directories (cross-platform rm -rf)
for (const pkg of ['core', 'prisma', 'drizzle', 'typeorm']) {
  rmSync(`packages/${pkg}/dist`, { recursive: true, force: true });
}

// Build core package
console.log('Building @querio/core...');
await $`tsc -p packages/core/tsconfig.build.json`;

// Bundle core ESM (single-file, self-contained)
await $`bun build packages/core/src/index.ts --outdir packages/core/dist --format esm --target node`;

// Bundle core CJS (outfile only — combining --outdir and --outfile makes Bun
// ignore --outfile and clobber the ESM index.js with CJS output)
await $`bun build packages/core/src/index.ts --outfile packages/core/dist/index.cjs --format cjs --target node`;

// Bundle the compiler subpath for CJS require() consumers
// (tsc output already serves the ESM `import` side of ./compiler)
await $`bun build packages/core/src/compiler/index.ts --outfile packages/core/dist/compiler/index.cjs --format cjs --target node`;

// Build adapter packages
const adapters = ['prisma', 'drizzle', 'typeorm'];
for (const adapter of adapters) {
  console.log(`Building @querio/${adapter}...`);
  await $`tsc -p packages/${adapter}/tsconfig.build.json`;
}

// ── Packaging smoke checks ────────────────────────────────────────────────

const coreDist = 'packages/core/dist';
const requiredArtifacts: [string, (src: string) => boolean][] = [
  ['index.js', (src) => /\bexport\b/.test(src) && !src.includes('__toCommonJS')],
  ['index.cjs', (src) => src.includes('__toCommonJS') || src.includes('require(')],
  ['compiler/index.js', (src) => /\bexport\b/.test(src) && !src.includes('__toCommonJS')],
  ['compiler/index.cjs', (src) => src.includes('__toCommonJS') || src.includes('require(')],
];

for (const [rel, check] of requiredArtifacts) {
  const file = `${coreDist}/${rel}`;
  if (!existsSync(file)) {
    throw new Error(`Build smoke check failed: missing ${file}`);
  }
  if (!check(readFileSync(file, 'utf8'))) {
    throw new Error(
      `Build smoke check failed: ${file} has the wrong module format ` +
        '(expected ESM for index.js, CJS for *.cjs)',
    );
  }
}

console.log('Build complete!');
