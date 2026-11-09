import assert from 'node:assert/strict';
const { chromium: localChromium } = await import('playwright').catch(() =>
  import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));

import { server } from './preview-pages.mjs';
let base = process.env.PAGES_URL;
if (!base) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/ace405-card-lab/`;
}
const browser = await localChromium.launch({
  ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {})
});
const errors = [];
const seed = '?seed=405';
try {
  for (const [entry, lang, width] of [['v3/', 'zh-CN', 1440], ['V3/en/', 'en', 390], ['v3/en/', 'en', 1440]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await page.goto(base + entry + seed);
    await page.locator('.start').waitFor();
    const english = lang === 'en';
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.equal(new URL(page.url()).search, seed);
    if (!english) assert.match(page.url(), /\/v3\/cn\//);
    assert.equal(await page.locator('.level-list button').count(), 3);
    await page.locator('.intro-art img').evaluate(img => img.decode());
    const checkText = async () => {
      if (english) {
        const text = await page.locator('body').innerText();
        assert.doesNotMatch(text.replace('中文', ''), /\p{Script=Han}/u);
        for (const attr of ['title','aria-label','alt']) {
          assert.doesNotMatch((await page.locator('[' + attr + ']').evaluateAll((els, a) => els.map(e => e.getAttribute(a)).join('\n'), attr)), /\p{Script=Han}/u);
        }
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at ' + width);
    };
    await checkText();
    const languageLink = page.locator('.language-link');
    // Exercise the requested URL itself before following its canonical language links.
    if (english) assert.equal(new URL(page.url()).pathname, new URL(entry, base).pathname);
    await languageLink.click();
    await page.locator('.start').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), english ? 'zh-CN' : 'en');
    await page.goBack();
    await page.locator('.start').waitFor();
    await page.getByRole('button', { name: english ? 'How to play' : '玩法说明' }).click();
    assert.equal(await page.locator('[role=dialog] li').count(), 6);
    await checkText();
    await page.keyboard.press('Escape');
    await page.locator('.start').click();
    await page.locator('.building-view[data-assets=ready]').nth(1).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: english ? 'Deck' : '牌组', exact:true }).click();
    assert.equal(await page.locator('.catalog .hand-card').count(), 44);
    await checkText();
    await page.keyboard.press('Escape');
    await page.locator('.hand .point-card').first().click();
    await page.locator('.npc [data-factor=GLZ]').click();
    await checkText();
    await page.locator('[data-direction="-1"]').click();
    await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
    await page.locator('.end-turn').click();
    await page.locator('.roundbar').getByText(english ? 'Round 2' : '第 2 轮', { exact:false }).waitFor();
    await page.getByRole('button', {name:english ? 'Compare designs' : '方案比较', exact:true}).click();
    await checkText();
    assert(await page.locator('.event-log-entry').count() > 0);
    await page.close();
    console.log('PASS', entry, lang, width);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
