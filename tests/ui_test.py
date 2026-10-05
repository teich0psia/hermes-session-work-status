from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
URL = os.environ['UI_TEST_URL']
KEY = 'hermes.plugin.session-work-status.work-status-v1'
results = []
def passed(name):
    results.append(name)
    print('PASS:', name)

with sync_playwright() as p:
    executable = os.environ.get('UI_CHROMIUM')
    browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
    context = browser.new_context(viewport={'width': 1100, 'height': 850})
    page = context.new_page()
    errors, console_errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.goto(URL); page.wait_for_load_state('networkidle')
    row = page.locator('[data-row=local-root]')
    mark = row.locator('[data-work-status]')
    expect(row).to_have_js_property('tagName', 'BUTTON')
    expect(mark).to_have_js_property('tagName', 'SPAN')
    assert mark.get_attribute('tabindex') is None and mark.get_attribute('role') is None
    assert page.locator('button button, [data-row] [tabindex]').count() == 0
    assert page.evaluate('testHarness.metrics().panes') == 0
    assert page.evaluate('testHarness.metrics().menus') == 0
    assert page.evaluate('testHarness.metrics().rowSlots') == 1
    assert '状態未確認' not in page.locator('body').inner_text()
    expect(mark).to_have_text('◇')
    passed('public durable-id slot inside installed RowButton; pointer span only, no nested button/focus stop/pane/menu contribution')

    mark.click()
    expect(page.get_by_role('menuitem', name='● 作業中', exact=True)).to_be_disabled()
    expect(page.get_by_role('status')).to_contain_text('複数')
    assert page.evaluate('key => localStorage.getItem(key)', KEY) is None
    page.keyboard.press('Escape'); expect(row).to_be_focused()
    mark.click(); page.get_by_role('menuitem', name='作業管理を開く', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('textbox', name='作業セッションを検索')).to_be_focused()
    page.keyboard.press('Escape')
    # Native menus stay native, including right-click on the mark itself.
    mark.click(button='right')
    expect(page.get_by_role('menuitem', name='Pin', exact=True)).to_be_enabled()
    expect(page.get_by_role('menuitem', name='Archive', exact=True)).to_be_enabled()
    expect(page.get_by_role('menuitem', name='● 作業中', exact=True)).to_have_count(0)
    page.keyboard.press('Escape')
    page.get_by_role('button', name='More 1', exact=True).focus(); page.keyboard.press('Enter')
    expect(page.get_by_role('menuitem', name='Pin', exact=True)).to_be_enabled(); page.keyboard.press('Escape')
    before = page.evaluate('testHarness.metrics().rowClicks')
    row.focus(); row.press('Enter'); row.press('Space')
    assert page.evaluate('testHarness.metrics().rowClicks') == before + 2
    passed('ID collision rejects write; native row Enter/Space, right-click and existing kebab remain unchanged')

    # Remove the synthetic collision; no focused-owner inference is used.
    page.evaluate("testHarness.fixtures.pages.nas = testHarness.fixtures.pages.nas.filter(r => r.id !== 'root'); testHarness.fixtures.hideCollisionRow = true; testHarness.rerender(); testHarness.host.state.profile.set('route-b')")
    page.wait_for_function('testHarness.fixtures.calls === 6')
    def direct(selector, state):
        before = page.evaluate('testHarness.metrics().rowClicks')
        page.locator(selector).locator('[data-work-status]').click()
        option = page.get_by_role('menuitem', name=state, exact=True)
        expect(option).to_be_enabled(); option.click()
        expect(page.get_by_role('menu')).to_have_count(0)
        assert page.evaluate('testHarness.metrics().rowClicks') == before
        expect(page.locator(selector)).to_be_focused()
    direct('[data-row=local-root]', '● 作業中')
    direct('[data-row=local-branch]', 'Ⅱ 保留')
    direct('[data-row=nas-other]', '✓ 完了')
    saved = page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
    assert saved['entries'] == {'["local","backend-a","root"]': 'working', '["local","backend-a","branch"]': 'paused', '["nas","backend-b","other"]': 'done'}
    assert saved['details']['["local","backend-a","root"]']['last_active'] == 100
    assert page.evaluate('testHarness.fixtures.calls') == 6 # cached row clicks
    mark.click(); expect(page.get_by_role('menuitem', name='● 作業中 ✓', exact=True)).to_be_enabled()
    page.screenshot(path=str(EVIDENCE / 'plugin-only-left-click-menu.png'))
    page.keyboard.press('Escape')
    passed('three states register directly via left mark; durable owner namespaces/dates/readback, click isolation, parent focus and read cache')

    def show():
        page.get_by_role('button', name='作業管理', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('button', name='一覧を更新', exact=True)).to_be_enabled()
    show()
    dialog = page.get_by_role('dialog')
    search = dialog.get_by_role('textbox', name='作業セッションを検索')
    articles = dialog.locator('article')
    expect(search).to_be_focused(); expect(articles).to_have_count(3)
    assert articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)') == ['root', 'other', 'branch']
    expect(dialog.get_by_text('取得窓の外の会話', exact=True)).to_have_count(0)
    dialog.get_by_role('button', name='会話を選択: 設計を進める', exact=True).click()
    expect(dialog.get_by_role('button', name='セッションを開く', exact=True)).to_be_enabled()
    page.screenshot(path=str(EVIDENCE / 'plugin-only-manager.png'))
    search.fill('backend-b'); expect(articles).to_have_count(1); search.fill('')
    dialog.get_by_role('button', name='保留', exact=True).click(); expect(articles).to_have_count(1)
    dialog.get_by_role('button', name='すべて', exact=True).click()
    dialog.get_by_label('並び順', exact=True).select_option('created')
    assert articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)') == ['branch', 'other', 'root']
    page.evaluate('testHarness.fixtures.delay = 350')
    dialog.get_by_role('button', name='一覧を更新', exact=True).click()
    dialog.get_by_label('並び順', exact=True).select_option('title')
    title_order = articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)')
    expect(dialog.get_by_role('button', name='一覧を更新', exact=True)).to_be_enabled()
    assert articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)') == title_order
    page.evaluate('testHarness.fixtures.delay = 0')
    dialog.get_by_label('並び順', exact=True).select_option('created')
    status = articles.first.get_by_role('button', name='作業状態: 保留', exact=True)
    status.focus(); status.press('Enter')
    option = page.get_by_role('menuitem', name='完了', exact=True); option.focus(); option.press('Enter')
    assert articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)') == ['branch', 'other', 'root']
    passed('registered-only Dialog + selected footer open, focused search/filter/created sort and keyboard state editing; operation order frozen')

    page.evaluate('testHarness.fixtures.failWrite = true')
    articles.first.get_by_role('button', name='作業状態: 完了', exact=True).click()
    page.get_by_role('menuitem', name='保留', exact=True).click()
    expect(articles.first.get_by_role('button', name='作業状態: 完了', exact=True)).to_be_visible()
    expect(dialog.get_by_role('alert')).to_contain_text('保存できません')
    page.evaluate('testHarness.fixtures.failWrite = false')
    articles.first.get_by_role('button', name='作業状態: 完了', exact=True).click(); page.keyboard.press('Escape')
    expect(dialog).to_be_visible()
    articles.first.get_by_role('button', name='作業状態: 完了', exact=True).click()
    page.get_by_role('menuitem', name='状態を解除', exact=True).click(); expect(articles).to_have_count(2)
    expect(page.locator('[data-row=local-branch]')).to_be_visible()
    page.keyboard.press('Escape'); expect(page.get_by_role('button', name='作業管理', exact=True)).to_be_focused()
    passed('failed write no optimistic success; menu Escape preserves Dialog; reset only unregisters, native conversation remains')

    # Existing saved registration outside current window, not a fabricated new owner.
    page.evaluate('''key => { const value = JSON.parse(localStorage.getItem(key)); const k = '["local","backend-a","old"]';
      value.entries[k] = 'paused'; value.details[k] = { sessionId:'old', title:'取得窓の外の会話', route:{connectionId:'local', mode:'local', profile:'route-a', targetProfile:'backend-a'}, last_active:40, started_at:2 };
      localStorage.setItem(key, JSON.stringify(value)); }''', KEY)
    page.reload(); page.wait_for_load_state('networkidle')
    page.evaluate('testHarness.fixtures.delay = 450')
    show_delayed = page.get_by_role('button', name='作業管理', exact=True)
    show_delayed.click(); expect(dialog).to_be_visible()
    expect(dialog.get_by_label('並び順', exact=True)).to_have_value('created')
    dialog.get_by_label('並び順', exact=True).select_option('title')
    before_order = articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)')
    expect(dialog.get_by_role('button', name='一覧を更新', exact=True)).to_be_enabled()
    assert articles.evaluate_all('(rows) => rows.map(r => r.dataset.session)') == before_order
    expect(dialog.get_by_text('local / backend-a · 取得範囲外（保存情報）', exact=True)).to_be_visible()
    page.evaluate('testHarness.fixtures.delay = 0')
    dialog.get_by_label('並び順', exact=True).select_option('recent')
    search.press('ArrowDown')
    expect(dialog.get_by_role('button', name='会話を選択: 設計を進める', exact=True)).to_be_focused()
    page.keyboard.press('Enter'); expect(dialog).to_have_count(0)
    assert page.evaluate('testHarness.fixtures.opened.at(-1)') == {'sessionId':'root', 'intent':'in-place', 'route':{'connectionId':'local', 'mode':'local', 'profile':'route-a', 'targetProfile':'backend-a'}}
    passed('saved outside-window details remain; sort persists; delayed read cannot override explicit title sort; arrow/Enter opens exact route')

    def select_remote():
        dialog.get_by_role('button', name='会話を選択: 別プロファイルの作業', exact=True).click()
        dialog.get_by_role('button', name='セッションを開く', exact=True).click()
    show(); page.evaluate('testHarness.fixtures.holdOpen = true'); select_remote()
    expect(dialog.get_by_role('button', name='開いています…', exact=True)).to_be_disabled()
    calls = page.evaluate('testHarness.fixtures.opened.length'); search.press('Enter')
    assert page.evaluate('testHarness.fixtures.opened.length') == calls
    page.evaluate("testHarness.fixtures.settleOpen('remote disconnected')")
    expect(dialog.get_by_role('button', name='セッションを開く', exact=True)).to_be_enabled()
    assert page.evaluate('testHarness.fixtures.notifications.at(-1).message') == 'remote disconnected'
    select_remote(); page.evaluate('testHarness.fixtures.settleOpen()'); expect(dialog).to_have_count(0)
    assert page.evaluate('testHarness.fixtures.opened.at(-1).route.connectionId') == 'nas'
    show(); select_remote(); page.keyboard.press('Escape'); show()
    page.evaluate('testHarness.fixtures.settleOpen()'); expect(dialog).to_be_visible()
    select_remote(); page.evaluate('testHarness.hotReload()'); show()
    count = page.evaluate('testHarness.fixtures.notifications.length')
    page.evaluate("testHarness.fixtures.settleOpen('stale failure')")
    expect(dialog).to_be_visible(); assert page.evaluate('testHarness.fixtures.notifications.length') == count
    page.evaluate('testHarness.fixtures.holdOpen = false'); page.keyboard.press('Escape')
    passed('async footer open pending/duplicate suppression/reject retention/success close; dismiss-reopen and hot-reload stale completion guarded')

    page.evaluate('testHarness.palette()'); expect(dialog).to_be_visible(); page.keyboard.press('Escape')
    page.evaluate('testHarness.keybind()'); expect(dialog).to_be_visible(); page.keyboard.press('Escape')
    page.evaluate('testHarness.hotReload(); testHarness.hotReload()')
    metrics = page.evaluate('testHarness.metrics()')
    assert metrics['storageListeners'] == metrics['profileListeners'] == metrics['connectionListeners'] == 1
    page.evaluate('testHarness.disable()'); expect(page.locator('[data-work-status]')).to_have_count(0)
    metrics = page.evaluate('testHarness.metrics()')
    assert metrics['storageListeners'] == metrics['profileListeners'] == metrics['connectionListeners'] == metrics['rowSlots'] == 0
    row.click(button='right'); expect(page.get_by_role('menuitem', name='Pin', exact=True)).to_be_visible(); page.keyboard.press('Escape')
    passed('titlebar/palette/keybind same Dialog; disable/reload removes scoped listeners/slots and leaves native menus')

    page.reload(); page.wait_for_load_state('networkidle')
    page.evaluate('testHarness.fixtures.failRead = true'); show()
    expect(dialog.get_by_role('alert').first).to_contain_text('接続不可'); expect(articles).to_have_count(3)
    page.keyboard.press('Escape')
    # Missing bridge is explicit, with no SDK-created-order or local fallback.
    page.evaluate("delete window.hermesDesktop.api; testHarness.host.state.profile.set('different')")
    show(); expect(dialog.get_by_role('alert').first).to_contain_text('通信API'); expect(articles).to_have_count(3)
    page.keyboard.press('Escape')
    page.evaluate('key => localStorage.setItem(key, "{broken")', KEY)
    page.reload(); page.wait_for_load_state('networkidle')
    page.locator('[data-row=local-branch] [data-work-status]').click()
    expect(page.get_by_role('menuitem', name='● 作業中', exact=True)).to_be_disabled()
    assert page.evaluate('key => localStorage.getItem(key)', KEY) == '{broken'
    page.keyboard.press('Escape')
    passed('read/bridge failures disclosed with saved registrations retained; malformed storage untouched and row write blocked')

    assert not errors, errors
    assert not console_errors, console_errors
    report = {'kind': 'Unmodified installed RowButton/SessionRowSlot/native menus/registry/Dialog in Chromium; owner/bridge/host IO and styling are fixtures, NOT Electron acceptance',
              'browser': browser.version, 'passed': results, 'page_errors': errors, 'console_errors': console_errors, 'final_metrics': page.evaluate('testHarness.metrics()')}
    (EVIDENCE / 'plugin-only-ui-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(results)} browser scenarios passed; page_errors=0; console_errors=0')
    context.close(); browser.close()
