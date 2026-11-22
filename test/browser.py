"""Run with uv run --no-project python test/browser.py ARTIFACT_DIR.
Requires an already installed playwright Python package and Chromium.
No production instance, AI backend, or Notion is contacted.
"""
import json
import pathlib
import subprocess
import sys
from playwright.sync_api import sync_playwright, expect

artifacts = pathlib.Path(sys.argv[1]).resolve()
artifacts.mkdir(parents=True, exist_ok=True)
fixture = subprocess.Popen(["node", "test/browser-fixture.mjs"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
try:
    base = json.loads(fixture.stdout.readline())["base"]
    ui = base + "/api/extensions/xangi-report/ui"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(ui)
        def library_options():
            if not page.locator('#library-options').evaluate('e=>e.open'):
                page.locator('#library-options > summary').click()
        expect(page).to_have_title('xangi-report')
        assert page.locator('.topbar').bounding_box()['height'] <= 60
        assert not page.locator('#library-options').evaluate('e=>e.open')
        def reader_tools():
            if page.locator('#report-details').is_hidden():
                page.get_by_role('button',name='詳細・操作',exact=True).click()
        page.get_by_role("button", name="最初のHTMLを追加").click()
        report = """<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <style>body{font:16px system-ui;padding:24px;max-width:700px}button{padding:12px}svg{width:100%;height:150px}</style>
        <h1>調査結果の比較</h1><p>保存したデータを操作して確認できます。</p>
        <svg viewBox="0 0 500 150"><rect id="bar" x="0" y="20" width="180" height="60" fill="#28594a"></rect></svg>
        <button id="calculate">比較値を変更</button><output id="value">180</output><p id="isolation"></p>
        <script>
        document.getElementById('calculate').onclick=()=>{document.getElementById('bar').setAttribute('width','360');document.getElementById('value').textContent='360'};
        let blocked=[];
        try{parent.document.body.dataset.attacked='yes'}catch(e){blocked.push('parent')}
        try{localStorage.setItem('attack','yes')}catch(e){blocked.push('storage')}
        try{document.cookie='attack=yes'}catch(e){blocked.push('cookie')}
        document.getElementById('isolation').textContent=blocked.join(',');
        fetch('/probe').then(()=>document.getElementById('isolation').textContent+=':network-allowed').catch(()=>document.getElementById('isolation').textContent+=':network-blocked');
        </script></html>"""
        page.locator("#html-file").set_input_files({"name": "調査レポート.html", "mimeType": "text/html", "buffer": report.encode()})
        page.locator("#project").fill("開発調査")
        page.locator("#editor").get_by_role("button", name="保存", exact=True).click()
        page.locator("#detail").wait_for(state="visible")
        frame = page.frame_locator("#report-frame")
        frame.get_by_role("button", name="比較値を変更").click()
        assert frame.locator("#value").inner_text() == "360"
        assert frame.locator("#bar").get_attribute("width") == "360"
        assert "parent" in frame.locator("#isolation").inner_text()
        assert "storage" in frame.locator("#isolation").inner_text()
        page.wait_for_timeout(100)
        assert "network-blocked" in frame.locator("#isolation").inner_text()
        assert not page.locator("body").get_attribute("data-attacked")
        assert page.request.get(base + "/probes").json()["probes"] == 0
        assert page.locator("#report-frame").get_attribute("sandbox") == "allow-scripts"
        assert page.locator('#report-details').is_hidden()
        assert page.locator('.detail-header').evaluate('h=>h.getBoundingClientRect().height')<=60
        assert page.locator('#report-viewport').evaluate('v=>v.clientHeight/innerHeight')>=0.78
        page.get_by_role('button',name='表示を広げる',exact=True).click()
        assert page.locator('.topbar').is_hidden()
        assert page.locator('#library').is_hidden()
        assert page.locator('#report-viewport').evaluate('v=>v.clientHeight/innerHeight')>=0.9
        frame.get_by_role('button',name='比較値を変更').click()
        page.get_by_role('button',name='通常表示に戻す',exact=True).click()
        assert page.locator('.topbar').is_visible()
        reader_tools();page.keyboard.press('Escape')
        assert page.locator('#report-details').is_hidden()
        page.screenshot(path=str(artifacts / "desktop-reader.png"))
        # The library can close without losing the selected report.
        page.get_by_role("button", name="一覧を閉じる", exact=True).click()
        assert page.locator("#library").is_hidden()
        assert page.locator("#toggle-library").get_attribute("aria-expanded") == "false"
        frame.get_by_role("button", name="比較値を変更").click()
        page.reload()
        frame.get_by_role("button", name="比較値を変更").wait_for()
        assert page.locator("#library").is_hidden()
        page.get_by_role("button", name="一覧", exact=True).click()
        handle=page.get_by_role("separator", name="一覧の幅", exact=True)
        handle.focus(); page.keyboard.press("ArrowRight")
        assert int(handle.get_attribute("aria-valuenow")) == 300
        box=handle.bounding_box()
        page.mouse.move(box['x']+box['width']/2,box['y']+80)
        page.mouse.down();page.mouse.move(box['x']+box['width']/2+100,box['y']+80,steps=8);page.mouse.up()
        assert int(handle.get_attribute("aria-valuenow")) == 400
        page.reload();frame.get_by_role("button", name="比較値を変更").wait_for()
        assert int(handle.get_attribute("aria-valuenow")) == 400
        box=handle.bounding_box()
        page.mouse.move(box['x']+box['width']/2,box['y']+100);page.mouse.down()
        page.mouse.move(box['x']+box['width']/2+70,box['y']+100,steps=5)
        page.keyboard.press('Escape');page.mouse.up()
        assert int(handle.get_attribute('aria-valuenow')) == 400
        handle.focus();page.keyboard.press("End")
        assert handle.get_attribute("aria-valuenow") == handle.get_attribute("aria-valuemax")
        page.keyboard.press("Home");assert handle.get_attribute("aria-valuenow") == '220'
        handle.dblclick();assert handle.get_attribute("aria-valuenow") == '290'
        page.screenshot(path=str(artifacts / "desktop-resized.png"))
        with page.expect_download() as event:
            reader_tools()
            page.get_by_role("link", name="HTMLを取得").click()
        download = event.value
        assert pathlib.Path(download.path()).read_text() == report
        reader_tools();page.get_by_role("button", name="更新", exact=True).click()
        page.locator("#title").fill("調査レポート 改訂")
        page.locator("#html-content").fill("<!doctype html><html><h1>改訂版の結果</h1></html>")
        page.locator("#editor").get_by_role("button", name="保存", exact=True).click()
        page.locator("#report-title").filter(has_text="改訂").wait_for()
        reader_tools();page.locator("#version").select_option("1")
        frame.get_by_role("button", name="比較値を変更").wait_for()
        page.get_by_role("button", name="☆ スター", exact=True).click()
        page.get_by_role("button", name="★ スター済み", exact=True).wait_for()
        library_options()
        page.locator("#starred").check()
        page.locator("#search").fill("一致しない")
        assert page.get_by_text("一致するレポートがありません").is_visible()
        page.locator("#search").fill("")
        page.reload()
        frame.get_by_role("button", name="比較値を変更").wait_for()
        # Browser Back traverses report/variant selections without mutating data.
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.get_by_role("separator", name="一覧の幅", exact=True).is_hidden()
        page.screenshot(path=str(artifacts / "mobile-reader.png"))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_role("button", name="一覧へ").click()
        page.locator("#reports .report-row").wait_for()
        assert not page.locator('#library-options').evaluate('e=>e.open')
        assert page.locator('#reports .report-row').first.bounding_box()['y'] < 320
        page.screenshot(path=str(artifacts / "mobile-library.png"))
        page.locator("#reports .report-row").click()
        reader_tools();page.locator("#version").select_option("1")
        frame.get_by_role("button", name="比較値を変更").wait_for()
        page.get_by_role("button", name="Notion設定").click()
        page.locator("#save-mode").select_option("manual")
        page.locator("#destination").fill("https://www.notion.so/" + "1" * 32)
        page.locator("#settings").get_by_role("button", name="設定を保存").click()
        page.get_by_role("button", name="Notionへ保存", exact=True).click()
        page.get_by_text("保存AIへ依頼済み", exact=False).wait_for()
        assert page.get_by_role("link", name="保存用会話を開く").get_attribute("href").startswith("/chat/")
        page.screenshot(path=str(artifacts / "mobile-save.png"))
        page.get_by_role("button", name="Notion設定").click()
        page.locator("#settings").wait_for(state="visible")
        page.screenshot(path=str(artifacts / "mobile-settings.png"))
        page.keyboard.press("Escape")
        # Direct view also receives the sandbox header; it is not UI-only.
        path = page.locator("#report-frame").get_attribute("src")
        direct = browser.new_page()
        direct.goto(path)
        direct.get_by_role("button", name="比較値を変更").click()
        assert direct.locator("#value").inner_text() == "360"
        assert "storage" in direct.locator("#isolation").inner_text()
        reader_tools();page.get_by_role("button", name="分類", exact=True).click()
        page.locator("#category").fill("開発")
        page.locator("#tags").fill("調査, 見直し")
        page.get_by_role("button", name="分類を保存", exact=True).click()
        expect(page.locator("#report-classification")).to_have_text("開発 / #調査 #見直し")
        assert page.locator("#version").input_value() == "1"
        page.get_by_role("button", name="一覧へ").click()
        library_options()
        page.locator("#category-filter").select_option("category:開発")
        page.locator("#tag-filter").select_option("調査")
        expect(page.locator('#filter-state')).to_have_text('（絞り込み中）')
        page.locator('#library-options > summary').click()
        assert page.locator('#filter-state').is_visible()
        library_options()
        assert page.locator("#reports .report-row").count() == 1
        page.reload()
        page.locator("#reports .report-row").wait_for()
        assert page.locator("#category-filter").input_value() == "category:開発"
        assert page.locator("#tag-filter").input_value() == "調査"
        page.screenshot(path=str(artifacts / "mobile-classification.png"))
        library_options()
        page.get_by_role("button", name="絞り込みを解除", exact=True).click()
        def import_old():
            page.get_by_role("button", name="HTMLを追加", exact=True).click()
            page.locator("#artifact-import summary").click()
            page.locator("#artifact-path").fill("fixtures/old.html")
            page.get_by_role("button", name="内容を確認", exact=True).click()
            page.locator("#artifact-status").filter(has_text="原本を確認しました").wait_for()
            assert page.locator("#html-content").get_attribute("readonly") is not None
            page.locator("#new-category").fill("過去")
            page.locator("#new-tags").fill("取り込み, 調査")
            page.locator("#editor").get_by_role("button", name="保存", exact=True).click()
            page.locator("#report-title").filter(has_text="過去の検証レポート").wait_for()
        import_old()
        frame.get_by_role("button", name="インポートを確認", exact=True).click()
        assert frame.get_by_role("button", name="42", exact=True).is_visible()
        assert page.locator("#report-origin").text_content() == "取込元：fixtures/old.html"
        page.screenshot(path=str(artifacts / "mobile-import.png"))
        import_old()
        page.locator("#notice").filter(has_text="同じ原本は取り込み済み").wait_for()
        page.get_by_role("button", name="一覧へ").click()
        assert page.locator("#reports .report-row").count() == 2
        direct_ui=browser.new_page()
        direct_ui.goto(base+'/api/extensions/xangi-report/service/ui')
        direct_ui.locator('#reports .report-row').first.wait_for()
        direct_ui.get_by_role('button',name='一覧を閉じる',exact=True).click()
        assert direct_ui.locator('#library').is_hidden()
        # Large fixed-size originals remain unmodified and can be fitted or
        # scrolled, even when their own document disables scrolling.
        page.set_viewport_size({"width":1366,"height":900})
        library_options()
        page.locator('#clear-filters').click()
        large='<!doctype html><html><style>html,body{width:1200px;height:1000px;margin:0;overflow:hidden}#end{position:absolute;left:1100px;top:920px}</style><body><h1>固定サイズ</h1><button id="end" onclick="this.textContent=42">右下の操作</button></body></html>'
        endpoint=base+'/api/extensions/xangi-report/service/api/reports'
        for title in ['Z 固定図','A 最初','M 最近']:
            response=page.request.post(endpoint,data={'title':title,'content':large})
            assert response.status==201
        page.reload();page.locator('#reports .report-row').filter(has_text='Z 固定図').wait_for()
        library_options()
        page.locator('#sort').select_option('title_asc')
        expect(page.locator('#reports .report-row strong').first).to_have_text('A 最初')
        library_options()
        page.locator('#sort').select_option('created_desc')
        expect(page.locator('#reports .report-row strong').first).to_have_text('M 最近')
        page.locator('#reports .report-row').filter(has_text='Z 固定図').click()
        frame.locator('#end').wait_for()
        page.wait_for_function("() => parseFloat(document.querySelector('#report-frame').style.width)>=1200 && parseFloat(document.querySelector('#report-frame').style.height)>=1000")
        page.locator('#viewer-zoom').select_option('page')
        page.wait_for_function("()=>{const v=document.querySelector('#report-viewport'),s=document.querySelector('#report-stage');return s.clientWidth<=v.clientWidth+1 && s.clientHeight<=v.clientHeight+1}")
        frame.locator('#end').click();expect(frame.locator('#end')).to_have_text('42')
        assert page.locator('#report-viewport').evaluate('v=>v.getBoundingClientRect().bottom<=innerHeight+1')
        page.screenshot(path=str(artifacts/'desktop-large-fit.png'))
        width=page.locator('#report-frame').evaluate('f=>f.style.width')
        page.evaluate("window.postMessage({type:'xangi-report-size',url:document.querySelector('#report-frame').src,width:9999,height:9999},'*')")
        frame.locator('body').evaluate("()=>parent.postMessage({type:'xangi-report-size',url:location.href,width:-1,height:NaN},'*')")
        page.wait_for_timeout(50)
        assert page.locator('#report-frame').evaluate('f=>f.style.width')==width
        page.locator('#viewer-zoom').select_option('1')
        page.set_viewport_size({'width':1000,'height':900})
        page.wait_for_function("()=>{const v=document.querySelector('#report-viewport');return v.scrollWidth>v.clientWidth && v.scrollHeight>v.clientHeight}")
        scroll=page.wait_for_function("()=>{const v=document.querySelector('#report-viewport');v.scrollLeft=v.scrollWidth;v.scrollTop=v.scrollHeight;return v.scrollLeft>0 && v.scrollTop>0 ? [v.scrollLeft,v.scrollTop] : false}").json_value()
        assert scroll[0]>0 and scroll[1]>0
        page.locator('#report-viewport').evaluate('v=>v.scrollTo(0,0)')
        page.locator('#report-viewport').hover()
        page.mouse.wheel(200,200)
        page.wait_for_function("()=>{const v=document.querySelector('#report-viewport');return v.scrollLeft>0 && v.scrollTop>0}")
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#viewer-zoom').select_option('page')
        page.wait_for_function("()=>{const v=document.querySelector('#report-viewport'),s=document.querySelector('#report-stage');return s.clientWidth<=v.clientWidth+1 && s.clientHeight<=v.clientHeight+1}")
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('.topbar').evaluate('h=>h.clientHeight')<90
        assert page.locator('#report-viewport').evaluate('v=>v.getBoundingClientRect().bottom<=innerHeight+1')
        page.screenshot(path=str(artifacts/'mobile-large-fit.png'))
        reader_tools();page.locator('#archive-button').click()
        page.locator('#archive-state').wait_for(state='visible')
        page.locator('#back-button').click()
        assert page.locator('#reports .report-row').filter(has_text='Z 固定図').count()==0
        library_options()
        page.locator('#archive-filter').select_option('archived')
        expect(page.locator('#reports .report-row')).to_have_count(1)
        page.reload();expect(page.locator('#reports .report-row')).to_have_count(1)
        assert page.locator('#archive-filter').input_value()=='archived'
        assert page.locator('#sort').input_value()=='created_desc'
        page.screenshot(path=str(artifacts/'mobile-archive.png'))
        page.locator('#reports .report-row').click()
        reader_tools();page.get_by_role('button',name='アーカイブから戻す',exact=True).click()
        page.locator('#archive-state').wait_for(state='hidden')
        page.locator('#back-button').click()
        expect(page.locator('#reports .report-row')).to_have_count(0)
        library_options()
        page.locator('#archive-filter').select_option('active')
        expect(page.locator('#reports .report-row')).to_have_count(5)
        viewport_html='<!doctype html><html><style>body{height:100vh;width:100vw}</style><body>viewport unit example</body></html>'
        viewport_report=page.request.post(endpoint,data={'title':'viewport example','content':viewport_html}).json()
        page.goto(base+'/api/extensions/xangi-report/ui#report='+viewport_report['id'])
        frame.locator('body').wait_for();page.wait_for_timeout(200)
        first_size=page.locator('#report-frame').evaluate('f=>[f.clientWidth,f.clientHeight]')
        page.wait_for_timeout(200)
        assert page.locator('#report-frame').evaluate('f=>[f.clientWidth,f.clientHeight]')==first_size
        assert errors == [], errors
        browser.close()
    (artifacts / "browser-result.json").write_text(json.dumps({"result": "passed", "checks": [
        "proxied UI with relative paths", "file upload", "interactive SVG and JavaScript", "sandbox parent/storage denial",
        "CSP network denial", "original download", "version update and previous version", "star/search",
        "reload retention", "390px list-reader-return", "Notion settings and mock request", "direct-view sandbox",
        "library close/open and persistence", "pointer and keyboard library resizing", "mobile width excludes desktop splitter",
        "category/tag edit without HTML revision", "persisted classification filters", "artifact snapshot import and duplicate prevention",
        "large fixed-size HTML fit/page/100% scroll and bottom-right interaction", "message source and numeric validation",
        "title/addition order and persisted sort", "archive hiding, persisted view and restoration",
        "compact reader toolbar, collapsed details and focused reading with exit", "no management-page JavaScript errors"]}, ensure_ascii=False, indent=2))
    print("Browser checks passed")
finally:
    fixture.stdin.close()
    try:
        fixture.wait(timeout=15)
    except subprocess.TimeoutExpired:
        fixture.terminate()
        fixture.wait(timeout=10)
