from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
URL = os.environ.get('UI_TEST_URL', 'http://127.0.0.1:8767')
KEY = 'hermes.plugin.session-work-status.work-status-v1'
results = []

def passed(name):
    results.append(name)
    print('PASS:', name)

with sync_playwright() as p:
    executable = os.environ.get('UI_CHROMIUM')
    browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
    context = browser.new_context(viewport={'width': 960, 'height': 720})
    page = context.new_page()
    errors = []
    console_errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    row = page.locator('[data-row=root]')
    badge = row.locator('[data-work-status]')
    expect(badge).to_have_attribute('aria-disabled', 'false')
    (EVIDENCE / 'initial-dom.json').write_text(json.dumps(page.get_by_role('button').all_text_contents(), ensure_ascii=False, indent=2))
    expect(badge).to_contain_text('未分類')
    pane = page.get_by_role('region', name='作業セッション')
    expect(pane.locator('article')).to_have_count(0)
    passed('default unclassified / working filter empty')
    expect(row).to_have_attribute('data-slot', 'row-button')
    assert page.locator('button button').count() == 0
    # Valid button descendants: no nested interactive element or tabindex.
    assert row.locator('button, a, input, select, textarea, [tabindex], [role=button]').count() == 0
    expect(badge).to_have_js_property('tagName', 'SPAN')
    passed('real RowButton parent / phrasing-only badge / no nested button or independent tab stop')

    # Real native DropdownMenu (Radix portal) and Button, not substitute HTML.
    badge.click(modifiers=['Control', 'Shift'])
    assert page.evaluate('testHarness.metrics().rowClicks') == 0
    # Radix deliberately does not open on Ctrl-click. Plain-click still opens.
    badge.click()
    expect(page.get_by_role('menu')).to_be_visible()
    page.get_by_role('menuitem', name='● 作業中', exact=True).click()
    expect(badge).to_contain_text('作業中')
    expect(pane.locator('article')).to_have_count(1)
    assert page.evaluate('testHarness.metrics().rowClicks') == 0
    assert page.evaluate('testHarness.metrics().rowPointers') == 0
    passed('row badge manual state / filter / modifier and pointer isolation')

    # Row badge deliberately has no independent focus inside the real parent
    # button. Keyboard edits use the pane's native Button + real Radix menu.
    expect(row).to_be_focused()  # close restores the native row, not a span
    pane.get_by_role('button', name='すべて 5', exact=True).click()
    pane_trigger = pane.locator('article').filter(has_text='設計を進める').get_by_role('button')
    pane_trigger.focus()
    pane_trigger.press('Enter')
    expect(page.get_by_role('menu')).to_be_visible()
    paused_option = page.get_by_role('menuitem', name='Ⅱ 保留', exact=True)
    expect(paused_option).to_be_enabled()
    paused_option.focus()
    paused_option.press('Enter')
    expect(pane_trigger).to_be_focused()
    expect(badge).to_contain_text('保留')
    assert page.evaluate('testHarness.metrics().rowKeys') == 0
    pane.get_by_role('button', name='保留 1', exact=True).click()
    expect(pane.locator('article')).to_have_count(1)
    badge.click()
    page.get_by_role('menuitem', name='✓ 完了', exact=True).click()
    expect(badge).to_contain_text('完了')
    pane.get_by_role('button', name='完了 1', exact=True).click()
    expect(pane.locator('article')).to_have_count(1)
    passed('pane keyboard / paused / done / row focus restoration / no parent hotkey propagation')

    badge.click(button='middle')
    assert page.evaluate('testHarness.metrics().rowClicks') == 0
    row.locator('span').first.click()
    assert page.evaluate('testHarness.metrics().rowClicks') == 1
    row.focus(); row.press('Enter'); row.press('Space')
    assert page.evaluate('testHarness.metrics().rowClicks') == 3
    assert page.evaluate('testHarness.metrics().rowKeys') == 2
    passed('aux click isolated / ordinary row navigation and native Enter-Space remain')

    page.reload(); page.wait_for_load_state('networkidle')
    expect(badge).to_contain_text('完了')
    page.evaluate('testHarness.rotate()')
    pane.get_by_role('button', name='一覧を更新', exact=True).click()
    expect(badge).to_have_attribute('aria-disabled', 'false'); expect(badge).to_contain_text('完了')
    expect(page.locator('[data-row=branch] [data-work-status]')).to_contain_text('未分類')
    page.evaluate('testHarness.switchProfile()')
    expect(badge).to_have_attribute('aria-disabled', 'false'); expect(badge).to_contain_text('完了')
    passed('real localStorage reload / compression durable identity / branch separation / profile switch')

    sibling = context.new_page()
    sibling.goto(URL); sibling.wait_for_load_state('networkidle')
    sibling_badge = sibling.locator('[data-row=root] [data-work-status]')
    expect(sibling_badge).to_have_attribute('aria-disabled', 'false')
    sibling_badge.click()
    sibling.get_by_role('menuitem', name='Ⅱ 保留', exact=True).click()
    expect(badge).to_contain_text('保留')
    sibling.close()
    badge.click(); page.get_by_role('menuitem', name='✓ 完了', exact=True).click()
    expect(badge).to_contain_text('完了')
    passed('real second-window localStorage event updates manual status')

    page.evaluate('testHarness.addCollision()')
    badge.click()
    expect(page.get_by_role('menuitem').first).to_be_disabled()
    expect(badge).to_have_attribute('title', '複数の所有者に同じIDがあります。作業セッションで所有者を選んでください。')
    expect(badge).to_have_attribute('aria-disabled', 'true')
    page.keyboard.press('Escape')
    page.evaluate('testHarness.fixtures.pages.nas.pop()')
    pane.get_by_role('button', name='一覧を更新', exact=True).click()
    expect(badge).to_have_attribute('aria-disabled', 'false'); expect(badge).to_contain_text('完了')
    passed('menu-open refresh detects newly conflicting owner before write')

    collision = page.locator('[data-row=collision] [data-work-status]')
    expect(collision).to_have_attribute('aria-disabled', 'true')
    expect(page.locator('[data-row=missing] [data-work-status]')).to_have_attribute('aria-disabled', 'true')
    collision.click(force=True)
    assert page.evaluate('testHarness.metrics().rowClicks') == 0  # reloaded harness
    expect(page.get_by_role('menu')).to_have_count(0)
    pane.get_by_role('button', name='すべて 5', exact=True).click()
    articles = pane.locator('article')
    local_collision = articles.filter(has_text='同じID・ローカル')
    local_collision.get_by_role('button').click()
    page.get_by_role('menuitem', name='● 作業中', exact=True).click()
    expect(articles.filter(has_text='同じID・NAS').get_by_role('button')).to_contain_text('未分類')
    pane.get_by_label('所有者', exact=True).select_option('["nas","backend-b"]')
    expect(articles).to_have_count(2)
    passed('collision / unresolved blocked / explicit pane owner isolation and owner filter')

    pane.get_by_label('所有者', exact=True).select_option('all')
    page.evaluate('testHarness.fixtures.failWrite = true')
    badge.click(); page.get_by_role('menuitem', name='Ⅱ 保留', exact=True).click()
    expect(badge).to_contain_text('完了')
    expect(pane.get_by_role('alert')).to_contain_text('保存できません')
    passed('SDK silent storage failure read-back; no optimistic false success')
    page.evaluate('testHarness.fixtures.failWrite = false')

    page.set_viewport_size({'width': 340, 'height': 820})
    pane.get_by_role('button', name='すべて 5', exact=True).click()
    page.screenshot(path=str(EVIDENCE / 'narrow-pane.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    passed('340px narrow viewport, no horizontal overflow')

    # Hot reload while menu is open must remove portal and scoped listeners.
    badge.click(); expect(page.get_by_role('menu')).to_be_visible()
    page.evaluate('testHarness.hotReload()')
    expect(page.get_by_role('menu')).to_have_count(0)
    expect(badge).to_have_attribute('aria-disabled', 'false'); expect(badge).to_contain_text('完了')
    metrics = page.evaluate('testHarness.metrics()')
    assert metrics['storageListeners'] == 1 and metrics['profileListeners'] == 1 and metrics['connectionListeners'] == 1
    for _ in range(2):
        page.evaluate('testHarness.hotReload()')
        expect(badge).to_have_attribute('aria-disabled', 'false')
    assert page.evaluate('testHarness.metrics().storageListeners') == 1
    page.evaluate('testHarness.disable()')
    expect(page.get_by_text('Plugin disabled', exact=True)).to_be_visible()
    metrics = page.evaluate('testHarness.metrics()')
    assert metrics['storageListeners'] == 0 and metrics['profileListeners'] == 0 and metrics['connectionListeners'] == 0 and metrics['contributions'] == 0
    passed('disable / repeated hot reload unmount portal and remove all scoped listeners')

    page.reload(); page.wait_for_load_state('networkidle')
    page.evaluate('testHarness.fixtures.truncated = true')
    pane.get_by_role('button', name='一覧を更新', exact=True).click()
    expect(badge).to_have_attribute('aria-disabled', 'true')
    expect(pane.get_by_role('alert').first).to_contain_text('取得上限500件')
    passed('truncated catalog disclosed; ownerless row edits blocked')
    page.evaluate('testHarness.fixtures.truncated = false; testHarness.fixtures.failRead = true')
    pane.get_by_role('button', name='一覧を更新', exact=True).click()
    expect(pane.get_by_role('alert').first).to_contain_text('接続不可')
    expect(badge).to_have_attribute('aria-disabled', 'true')
    passed('failed REST catalog surfaced rather than false empty complete list')

    page.evaluate('key => localStorage.setItem(key, "{broken")', KEY)
    page.reload(); page.wait_for_load_state('networkidle')
    expect(pane.get_by_role('alert').first).to_contain_text('読み取れません')
    expect(badge).to_have_attribute('aria-disabled', 'true')
    assert page.evaluate('key => localStorage.getItem(key)', KEY) == '{broken'
    passed('malformed local storage blocked and retained without overwrite')

    assert not errors, errors
    assert not console_errors, console_errors
    report = {'kind': 'SDK harness; NOT native Electron acceptance', 'browser': browser.version, 'passed': results, 'page_errors': errors, 'console_errors': console_errors, 'final_metrics': page.evaluate('testHarness.metrics()')}
    (EVIDENCE / 'ui-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(results)} browser scenarios passed; page_errors=0')
    context.close()
    browser.close()
