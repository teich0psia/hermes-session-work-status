import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const source = process.env.HERMES_SOURCE;
if (!source) throw new Error('Set HERMES_SOURCE to the unmodified installed Hermes source with Desktop dependencies.');
const native = `${source}/apps/desktop/src`;
const require = createRequire(`${source}/apps/desktop/package.json`);
const react = dirname(require.resolve('react/package.json'));
const reactDom = dirname(require.resolve('react-dom/package.json'));
const fixtures = resolve('tests/harness/native-fixtures.js');
const mocks = ['app/open-session', 'components/pane-shell/tree/store', 'hermes', 'i18n', 'lib/haptics', 'lib/profile-color',
  'lib/session-export', 'store/gateway', 'store/notifications', 'store/projects', 'store/session', 'store/session-color',
  'store/session-states', 'store/session-unread', 'store/windows', 'store/send-diagnostics'];
await build({ entryPoints: ['tests/harness/app.js'], outfile: 'tests/harness/bundle.js', bundle: true, format: 'esm',
  platform: 'browser', target: 'es2022', jsx: 'automatic', alias: {
    '@hermes/plugin-sdk': resolve('tests/harness/sdk.js'), '@native': native, '@': native,
    '@hermes/shared': `${source}/apps/shared/src`,
    'react': react, 'react-dom': reactDom,
    '@tabler/icons-react': resolve('node_modules/@tabler/icons-react'),
    ...Object.fromEntries(mocks.map(path => [`@/${path}`, fixtures]))
  }, nodePaths: [`${source}/apps/desktop/node_modules`, `${source}/node_modules`],
  define: { 'process.env.NODE_ENV': '"development"' }
});
console.log('Built unmodified installed SessionRowSlot + RowButton + native menus/registry/Dialog; host IO and inventory are fixtures, not Electron.');
