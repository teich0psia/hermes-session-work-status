"""Focused owner-invalidation regression using the shipped plugin/native renderer.
Host routing inventory and bridge IO are controlled fixtures, not Electron.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import urlopen
import json
import os
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'hermes.plugin.session-work-status.work-status-v1'
report = {'kind': 'shipped plugin + unmodified installed renderer; controlled owner/bridge IO, NOT Electron', 'passed': []}
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT / 'tests/harness')))
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    url = f'http://127.0.0.1:{server.server_port}'
    with urlopen(url) as response:
        assert b'Session Work Status' in response.read()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ['UI_CHROMIUM'])
        try:
            page = browser.new_page(viewport={'width': 1100, 'height': 850})
            errors, consoles = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: consoles.append(message.text) if message.type == 'error' else None)
            page.goto(url)
            page.wait_for_load_state('networkidle')
            # Remote has a unique durable id; the local root collision is irrelevant.
            page.locator('[data-row=nas-other] [data-work-status]').click()
            page.get_by_role('menuitem', name='✓ 完了', exact=True).click()
            page.locator('[data-row=local-branch] [data-work-status]').click()
            page.get_by_role('menuitem', name='Ⅱ 保留', exact=True).click()
            page.get_by_role('button', name='作業管理', exact=True).click()
            dialog = page.get_by_role('dialog')
            refresh = dialog.get_by_role('button', name='一覧を更新', exact=True)
            expect(refresh).to_be_enabled()
            remote = dialog.get_by_role('button', name='会話を選択: 別プロファイルの作業', exact=True)
            footer = dialog.get_by_role('button', name='セッションを開く', exact=True)
            search = dialog.get_by_role('textbox', name='作業セッションを検索')
            remote.click()
            order = lambda: dialog.locator('article').evaluate_all('(rows) => rows.map(r => r.dataset.session)')
            frozen = order()
            assert frozen == ['other', 'branch']

            # Same routing alias retargeted to another backend owner; old owner
            # must be retained for status editing but may never open.
            page.evaluate("""testHarness.fixtures.routes[1] = {...testHarness.fixtures.routes[1], targetProfile:'backend-c'};
                testHarness.fixtures.pages.nas = testHarness.fixtures.pages.nas.map(s => ({...s, profile:'backend-c'}));
                testHarness.host.state.profile.set('retargeted')""")
            expect(refresh).to_be_enabled()
            page.wait_for_function('testHarness.fixtures.calls >= 6')
            report['retarget_observed'] = {'row_enabled': remote.is_enabled(), 'footer_enabled': footer.is_enabled(),
                'inventory': page.evaluate('testHarness.fixtures.routes[1]'), 'order': order()}
            assert not remote.is_enabled(), 'P1: old owner row remains selectable after retarget'
            expect(footer).to_be_disabled()
            search.press('Enter')
            assert page.evaluate('testHarness.fixtures.opened.length') == 0
            expect(dialog).to_be_visible()
            assert order() == frozen
            report['passed'].append('retarget: old owner retained, row/footer/Enter blocked without reorder')

            # Restore the exact owner via a NEW routing alias and different dates.
            # Hold controlled bridge reads so loading cannot use old cached rows.
            page.evaluate("""testHarness.fixtures.delay = 350;
                testHarness.fixtures.routes[1] = {...testHarness.fixtures.routes[1], profile:'route-fresh', targetProfile:'backend-b'};
                testHarness.fixtures.pages.nas = testHarness.fixtures.pages.nas.map(s => ({...s, profile:'backend-b', last_active:1}));
                testHarness.host.state.connectionId.set('changed-context')""")
            expect(dialog.get_by_role('button', name='更新中…', exact=True)).to_be_disabled()
            expect(remote).to_be_disabled()
            expect(footer).to_be_disabled()
            search.press('Enter')
            assert page.evaluate('testHarness.fixtures.opened.length') == 0
            expect(refresh).to_be_enabled()
            expect(remote).to_be_enabled()
            assert order() == frozen
            # Selection survives the refresh; footer must use newly resolved route.
            expect(footer).to_be_enabled()
            footer.click()
            expect(dialog).to_have_count(0)
            payload = page.evaluate('testHarness.fixtures.opened.at(-1)')
            assert payload == {'sessionId':'other', 'route':{'connectionId':'nas', 'mode':'remote', 'profile':'route-fresh', 'targetProfile':'backend-b'}, 'intent':'in-place'}
            report['fresh_open'] = payload
            report['passed'].append('loading blocks stale actions; recovered exact owner opens fresh alias, order frozen')

            page.evaluate('testHarness.fixtures.delay = 0')
            page.get_by_role('button', name='作業管理', exact=True).click()
            expect(refresh).to_be_enabled()
            remote.click()
            # Explicit refresh retains the cached catalog while loading. A
            # same-owner alias change must still disable the old live route.
            cached_order = order()
            before = page.evaluate('testHarness.fixtures.opened.length')
            page.evaluate("""testHarness.fixtures.delay = 350;
                testHarness.fixtures.routes[1] = {...testHarness.fixtures.routes[1], profile:'route-latest'};
                testHarness.fixtures.pages.nas = testHarness.fixtures.pages.nas.map(s => ({...s, last_active:1000}))""")
            refresh.click()
            expect(dialog.get_by_role('button', name='更新中…', exact=True)).to_be_disabled()
            expect(remote).to_be_disabled()
            expect(footer).to_be_disabled()
            search.press('Enter')
            assert page.evaluate('testHarness.fixtures.opened.length') == before
            expect(refresh).to_be_enabled()
            expect(remote).to_be_enabled()
            assert order() == cached_order
            remote.press('Enter')
            expect(dialog).to_have_count(0)
            assert page.evaluate('testHarness.fixtures.opened.at(-1).route.profile') == 'route-latest'
            report['passed'].append('cached live route disabled during refresh; same-owner alias updates and row Enter uses fresh route without reorder')
            page.evaluate('testHarness.fixtures.delay = 0')
            page.get_by_role('button', name='作業管理', exact=True).click()
            expect(refresh).to_be_enabled()
            remote.click()
            # Invalidate in the same browser task as Enter, before React commits
            # its disabled state: exercises the imperative open-time guard.
            before = page.evaluate('testHarness.fixtures.opened.length')
            page.evaluate("""(() => {
                testHarness.fixtures.routes = testHarness.fixtures.routes.filter(r => r.connectionId !== 'nas');
                testHarness.host.state.profile.set('owner-removed');
                document.querySelector('[role=dialog] input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
            })()""")
            expect(refresh).to_be_enabled()
            expect(remote).to_be_disabled()
            expect(footer).to_be_disabled()
            search.press('Enter')
            assert page.evaluate('testHarness.fixtures.opened.length') == before
            expect(dialog.locator('article')).to_have_count(2)
            report['passed'].append('same-task invalidation/Enter refuses old closure; owner removal disables open without deleting registration')

            # Storage-only status change and unregister must remain usable while
            # disconnected, and affect only the saved exact identity.
            article = dialog.locator('article[data-session=other]')
            article.get_by_role('button', name='作業状態: 完了', exact=True).click()
            page.get_by_role('menuitem', name='保留', exact=True).click()
            saved = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
            assert saved['entries']['["nas","backend-b","other"]'] == 'paused'
            article.get_by_role('button', name='作業状態: 保留', exact=True).click()
            page.get_by_role('menuitem', name='状態を解除', exact=True).click()
            expect(article).to_have_count(0)
            saved = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
            assert '["nas","backend-b","other"]' not in saved['entries']
            assert '["nas","backend-b","other"]' not in saved['details']
            assert '["local","backend-a","branch"]' in saved['entries']
            expect(page.locator('[data-row=nas-other]')).to_be_visible()
            assert page.evaluate('testHarness.fixtures.opened.length') == before
            report['passed'].append('missing-owner registration can change/reset saved identity; conversation remains')
            assert not errors and not consoles, (errors, consoles)
            report.update(browser=browser.version, page_errors=errors, console_errors=consoles)
        finally:
            browser.close()
except Exception as error:
    report['failure'] = str(error)
    raise
finally:
    dest = ROOT / 'evidence' / os.environ.get('OWNER_EVIDENCE', 'plugin-only-owner-refresh-green.json')
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    server.shutdown()
    server.server_close()
    worker.join()
    print('Owned ephemeral owner-regression server closed')
