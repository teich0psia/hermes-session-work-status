// Focused single-index export contract + exact distributable parity, not full
// Desktop typecheck/build. All imports of the installed index are externalized.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const source = process.env.HERMES_SOURCE;
if (!source) throw new Error('Set HERMES_SOURCE to the unmodified installed source');
const sdk = resolve(source, 'apps/desktop/src/sdk/index.ts');
const names = readFileSync('src/plugin.js', 'utf8').match(/import \{([\s\S]*?)\} from '@hermes\/plugin-sdk'/)[1]
  .split(',').map(name => name.trim()).filter(Boolean);
await build({ stdin: { contents: `import { ${names.join(',')} } from ${JSON.stringify(sdk)}; console.log(${names.join(',')});`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'browser', plugins: [{ name: 'single-index-contract', setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path === sdk ? { path: sdk } : { path: args.path, external: true });
  } }] });
const built = await build({ entryPoints: ['src/plugin.js'], bundle: true, write: false, format: 'esm', platform: 'browser',
  target: 'es2022', external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'], legalComments: 'none' });
const artifact = readFileSync('plugin.js');
if (!Buffer.from(built.outputFiles[0].contents).equals(artifact)) throw new Error('Source/bundle byte mismatch; run npm run build');
console.log('Installed SDK index named exports resolve:', names.join(', '));
console.log('Source/bundle byte parity OK; plain ESM external imports restricted to SDK/React');
console.log('plugin.js SHA256:', createHash('sha256').update(artifact).digest('hex'));
