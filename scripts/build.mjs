import { build } from 'esbuild';
await build({ entryPoints: ['src/plugin.js'], outfile: 'plugin.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'], legalComments: 'none' });
console.log('Built plain ESM plugin.js (SDK/React imports only)');
