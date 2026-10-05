import { build } from 'esbuild';
import { resolve } from 'node:path';
const source = process.env.HERMES_SOURCE;
if (!source) throw new Error('Set HERMES_SOURCE to the Hermes source checkout with its existing node_modules.');
await build({
  entryPoints: ['tests/harness/app.js'], outfile: 'tests/harness/bundle.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  alias: { '@hermes/plugin-sdk': resolve('tests/harness/sdk.js'), '@native': `${source}/apps/desktop/src`, '@': `${source}/apps/desktop/src`, 'react': `${source}/node_modules/react`, 'react-dom': `${source}/node_modules/react-dom`, '@tabler/icons-react': resolve('node_modules/@tabler/icons-react') },
  nodePaths: [`${source}/node_modules`], define: { 'process.env.NODE_ENV': '"development"' }
});
console.log('Harness built with installed Hermes React, nanostores, native RowButton, Button and DropdownMenu; host routing is mocked.');
