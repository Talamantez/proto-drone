"""Browser end-to-end tests. Needs: pip install playwright && playwright install chromium.

    npm run e2e

Starts its own static server. Network calls to Nominatim are mocked; map tiles and public overlays are not needed.
"""
import contextlib, functools, http.server, json, pathlib, sys, threading, traceback
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]


@contextlib.contextmanager
def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    finally:
        srv.shutdown()


def page_with_errors(ctx):
    pg, errs = ctx.new_page(), []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'net::' not in m.text and 'Failed to load resource' not in m.text and errs.append(m.text[:200]))
    return pg, errs


def tour_title(pg):
    return pg.inner_text('#tour h3') if pg.is_visible('#tour') else None


def test_desktop_first_run(b, url):
    ctx = b.new_context(viewport={'width': 1300, 'height': 760}, accept_downloads=True)
    pg, errs = page_with_errors(ctx)
    pg.goto(url); pg.wait_for_timeout(1200)
    assert tour_title(pg).startswith('Welcome')
    pg.click('#tour [data-a=next]'); pg.wait_for_timeout(200)
    assert tour_title(pg).startswith('1 · Draw')
    pg.click('#dbDraw')
    assert pg.is_visible('#dbClose') and not pg.is_visible('#dbDraw'), 'draw bar switches to drawing mode'
    for x, y in [(600, 320), (850, 320), (850, 520), (600, 520)]:
        pg.mouse.click(x, y)
    pg.click('#dbUndo'); assert pg.evaluate('__app.S.drawPts.length') == 3
    pg.mouse.click(600, 520); pg.click('#dbClose'); pg.wait_for_timeout(1400)
    assert tour_title(pg).startswith('2 · The plan'), 'the tour advances when the polygon closes'
    pg.click('#tour [data-a=next]'); pg.wait_for_timeout(200)
    assert tour_title(pg).startswith('3 · Fly'); assert not pg.is_disabled('#hudRun')
    pg.click('#hudRun'); pg.wait_for_timeout(1800)
    assert pg.inner_text('#hudRun') == 'Pause' and tour_title(pg).startswith('4 · Break')
    pg.click('#hudFaultRows button[data-d="0"][data-l="lte"]'); pg.wait_for_timeout(1000)
    assert 'off' in pg.get_attribute('#hudFaultRows button[data-d="0"][data-l="lte"]', 'class'), 'cut link is shown struck through'
    for _ in range(8):
        if pg.is_visible('#tour'): pg.click('#tour [data-a=next]'); pg.wait_for_timeout(150)
    assert not pg.is_visible('#tour')
    # Layers panel
    pg.click('#lyr [data-a=toggle]') if not pg.is_visible('#lyr .lbody') else None
    assert pg.locator('#lyr .lrow[data-id]').count() == 12
    pg.click('#lyr .lrow[data-id=streets] [data-a=eye]'); pg.click('#lyr .lrow[data-id=streets] [data-a=exp]')
    pg.select_option('#lyr .lrow[data-id=streets] select', 'multiply')
    pg.evaluate("(()=>{const i=document.querySelector('#lyr .lrow[data-id=streets] input');i.value=50;i.dispatchEvent(new Event('input',{bubbles:true}))})()")
    s = pg.evaluate("(()=>{const s=__app.S.map.getPane('p_streets').style;return [s.opacity,s.mixBlendMode]})()")
    assert s == ['0.5', 'multiply'], s
    pg.click('#lyr .lrow[data-id=survey] [data-a=eye]'); assert pg.evaluate("__app.S.map.getPane('p_survey').style.display") == 'none'
    pg.click('#lyr .lrow[data-id=survey] [data-a=eye]')
    pg.click('#lyr .lrow[data-id=sat] [data-a=up]'); assert pg.evaluate('__app.LP.order').index('sat') < pg.evaluate('__app.LP.order').index('streets')
    # Polygon library: save, export, import, use
    pg.click('#libSave'); assert json.loads(pg.evaluate('localStorage.polyLib')).__len__() == 1
    with pg.expect_download() as dl:
        pg.click('#libExport')
    gj = json.load(open(dl.value.path())); assert gj['features'][0]['geometry']['type'] == 'Polygon'
    imp = ROOT / 'tests' / 'e2e' / '_import.geojson'
    imp.write_text(json.dumps({'type': 'Feature', 'properties': {'name': 'Test block'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[14.485, 40.750], [14.488, 40.750], [14.488, 40.752], [14.485, 40.752], [14.485, 40.750]]]}}))
    try:
        pg.set_input_files('#libFile', str(imp)); pg.wait_for_timeout(400)
    finally:
        imp.unlink()
    assert 'Imported 1 area' in pg.inner_text('#libNote')
    pg.click('#libUse'); pg.wait_for_timeout(700); assert pg.input_value('#missionName') == 'Test block'
    assert not errs, errs
    ctx.close()


def test_navigation(b, url):
    ctx = b.new_context(viewport={'width': 1300, 'height': 760}, geolocation={'latitude': 51.5007, 'longitude': -0.1246}, permissions=['geolocation'])
    pg, errs = page_with_errors(ctx)
    pg.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(
        [{'display_name': 'Big Ben, Westminster, London, UK', 'lat': '51.5007', 'lon': '-0.1246', 'boundingbox': ['51.4995', '51.5018', '-0.1262', '-0.1230']}])))
    center = lambda: pg.evaluate("(()=>{const c=__app.S.map.getCenter();return [+c.lat.toFixed(3),+c.lng.toFixed(3),__app.S.map.getZoom()]})()")
    pg.goto(url + '#map=15/48.85840/2.29450'); pg.wait_for_timeout(1200)
    assert center() == [48.858, 2.295, 15] and not pg.is_visible('#tour'), 'a shared link restores the view and skips the tour'
    pg.fill('#searchQ', '40.7508, 14.4869'); pg.press('#searchQ', 'Enter'); pg.wait_for_timeout(1800)
    assert center()[:2] == [40.751, 14.487]
    pg.fill('#searchQ', 'big ben'); pg.press('#searchQ', 'Enter'); pg.wait_for_timeout(400)
    pg.click('#searchRes button[data-i="0"]'); pg.wait_for_timeout(1900)
    assert center()[:2] == [51.501, -0.125]
    assert pg.evaluate('location.hash').startswith('#map='), 'the URL follows the map'
    pg.click('#navLoc'); pg.wait_for_timeout(2200); assert 'blue dot' in pg.inner_text('#hint')
    pg.mouse.move(800, 400); assert ',' in pg.inner_text('#coordbox')
    pg.click('body', position={'x': 5, 'y': 5}); pg.keyboard.press('/'); assert pg.evaluate('document.activeElement.id') == 'searchQ'
    assert not errs, errs
    ctx.close()


def test_mobile(b, url):
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, has_touch=True, is_mobile=True)
    pg, errs = page_with_errors(ctx)
    pg.goto(url); pg.wait_for_timeout(1200)
    sheet = lambda: pg.evaluate('document.body.dataset.sheet')
    assert sheet() == 'min', 'the settings sheet starts collapsed'
    box = pg.evaluate("(()=>{const r=document.getElementById('map').getBoundingClientRect();return [r.height, innerHeight]})()")
    assert box[0] >= box[1] - 1, 'the map fills the screen'
    pg.tap('#tour [data-a=next]'); pg.wait_for_timeout(300)
    assert tour_title(pg).startswith('1 · Draw') and sheet() == 'min'
    top = pg.evaluate("document.getElementById('tour').getBoundingClientRect().top")
    assert pg.evaluate("document.getElementById('dbDraw').getBoundingClientRect().top") > top + 200, 'the card is away from the Draw button'
    pg.tap('#dbDraw')
    for x, y in [(120, 300), (300, 300), (300, 520)]:
        pg.touchscreen.tap(x, y); pg.wait_for_timeout(100)
    assert not pg.is_disabled('#dbClose'); pg.tap('#dbClose'); pg.wait_for_timeout(1400)
    assert tour_title(pg).startswith('2 · The plan') and sheet() == 'half', 'a settings step opens the sheet'
    pg.tap('#tour [data-a=next]'); pg.wait_for_timeout(500)
    assert tour_title(pg).startswith('3 · Fly') and sheet() == 'min', 'a map step closes it again'
    pg.tap('#hudRun'); pg.wait_for_timeout(1200); assert pg.inner_text('#hudRun') == 'Pause'
    pg.tap('#sheetHandle'); pg.wait_for_timeout(400); assert sheet() == 'half'
    pg.tap('#sheetHandle'); pg.wait_for_timeout(400); assert sheet() == 'min'
    assert not errs, errs
    ctx.close()


def test_survey_never_hidden_under_imagery(b, url):
    ctx = b.new_context(viewport={'width': 1300, 'height': 760})
    pg, errs = page_with_errors(ctx)
    pg.goto(url); pg.wait_for_timeout(1000); pg.keyboard.press('Escape')
    pg.click('#lyr [data-a=toggle]')
    for _ in range(11): pg.click('#lyr .lrow[data-id=sat] [data-a=up]')
    pg.click('#lyr .lrow[data-id=survey] [data-a=eye]')
    order = pg.evaluate('__app.LP.order'); assert order[0] == 'sat' and pg.evaluate("__app.S.map.getPane('p_survey').style.display") == 'none'
    pg.click('#lyr [data-a=toggle]'); pg.click('#dbDraw')
    for x, y in [(600, 320), (850, 320), (850, 520)]: pg.mouse.click(x, y)
    pg.click('#dbClose'); pg.wait_for_timeout(1200)
    z = pg.evaluate("(()=>{const z=n=>+__app.S.map.getPane(n).style.zIndex;return [z('p_survey'),z('p_fleet'),z('p_sat'),__app.S.map.getPane('p_survey').style.display]})()")
    assert z[0] > z[2] and z[1] > z[2] and z[3] == '', z
    assert 'brought to the front' in pg.inner_text('#hint')
    pg.click('#lyr [data-a=toggle]'); pg.click('#lyr [data-a=reset]')
    assert pg.evaluate('__app.LP.order') == ['fleet', 'survey', 'poi', 'env', 'ovFlood', 'ovWater', 'ovNight', 'ovLst', 'ovNdvi', 'hist', 'streets', 'sat']
    assert not errs, errs
    ctx.close()


def test_threats_and_report(b, url):
    ctx = b.new_context(viewport={'width': 1300, 'height': 760})
    pg, errs = page_with_errors(ctx)
    pg.goto(url); pg.wait_for_timeout(1000); pg.keyboard.press('Escape')
    pg.click('#btnDemo'); pg.wait_for_timeout(1500)
    if pg.is_visible('#tour'): pg.keyboard.press('Escape')
    assert pg.is_visible('#btnThreats')
    pg.click('#btnThreats'); assert pg.is_visible('#threatMenu')
    pg.click('#shieldSeg [data-lvl=full]'); assert pg.evaluate('__app.S.mission.def.attest === true && __app.S.mission.def.daa === true')
    pg.click('#shieldSeg [data-lvl=off]'); assert pg.evaluate('!__app.S.mission.def.auth')
    pg.click('#btnRun'); pg.wait_for_timeout(500)
    pg.click('#threatItems button[data-i="0"]'); pg.wait_for_timeout(300)
    assert pg.evaluate('__app.S.mission.sec.gps') == 1, 'GPS spoof launched from the menu'
    pg.click('#btnReport'); assert pg.is_visible('#report') and 'security' in pg.inner_text('#report').lower()
    assert not errs, errs
    ctx.close()


TESTS = [test_desktop_first_run, test_navigation, test_mobile, test_survey_never_hidden_under_imagery, test_threats_and_report]

if __name__ == '__main__':
    failed = 0
    with serve() as url, sync_playwright() as p:
        b = p.chromium.launch()
        for t in TESTS:
            try:
                t(b, url); print('PASS', t.__name__)
            except Exception as e:  # noqa: BLE001
                failed += 1; print('FAIL', t.__name__, '-', repr(e)[:400]); traceback.print_exc()
        b.close()
    sys.exit(1 if failed else 0)
