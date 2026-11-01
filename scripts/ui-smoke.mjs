import assert from 'node:assert/strict';
const { chromium } = await import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
for (const viewport of [{ width: 1920, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    let state = 1;
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /进入采光关/ }).click();
  assert(await page.locator('.hand-card').count() >= 5);
  if (viewport.width > 850) {
    const hand = await page.locator('.hand-card').first().boundingBox();
    assert(hand && hand.y >= 0 && hand.y + hand.height <= viewport.height, `hand card must fit on first screen at ${viewport.width}`);
  }
  await page.getByRole('button', { name: /查看本局完整牌组/ }).click();
  assert(await page.locator('.deck-modal').isVisible());
  await page.locator('.deck-modal .close').click();
  await page.locator('.hand-card.design-card').first().click();
  assert(await page.locator('.action-panel').isVisible());
  assert.equal(await page.locator('.availability-list > div').count(), 2, 'selected design explains both play modes');
  if (viewport.width > 850) {
    const panel = await page.locator('.action-panel').boundingBox();
    const hand = await page.locator('.hand-card').first().boundingBox();
    assert(panel && panel.y >= 0 && panel.y + panel.height <= viewport.height, `action panel must fit at ${viewport.width}`);
    assert(hand && hand.y + hand.height <= viewport.height, `hand stays visible with action panel at ${viewport.width}`);
  }
  assert(await page.locator('.action-panel .route-hint').isVisible());
  await page.screenshot({ path: `../output/ace405_plan/demo_${viewport.width}_selected.png`, fullPage: true });
  await page.locator('.play-button').click();
  const greyDesign = page.locator('.hand-card.design-card.muted').first();
  assert(await greyDesign.count(), 'a second design is unavailable after one installation');
  await greyDesign.click();
  assert.equal(await page.locator('.availability-list .blocked').count(), 2, 'grey card explains both blocked modes');
  assert.match(await page.locator('.availability-list').innerText(), /本轮已安装|槽已安装/);
  await page.screenshot({ path: `../output/ace405_plan/demo_${viewport.width}_grey.png`, fullPage: true });
  await page.locator('.turn-actions button').click();
  assert(await page.getByText('竞标方案 A').isVisible());
  await page.screenshot({ path: `../output/ace405_plan/demo_${viewport.width}.png`, fullPage: true });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  assert(width.scroll <= width.inner + 2, `horizontal overflow at ${viewport.width}: ${JSON.stringify(width)}`);
  await page.close();
}
const retainPage = await browser.newPage({ viewport: { width: 1200, height: 850 } });
retainPage.setDefaultTimeout(5000);
retainPage.on('pageerror', e => errors.push(e.message));
await retainPage.addInitScript(() => {
  let state = 3;
  Math.random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
});
await retainPage.goto('http://127.0.0.1:5173/');
await retainPage.getByRole('button', { name: /进入采光关/ }).click();
await retainPage.locator('.hand-card.function-card').filter({ hasText: '保留备选' }).click();
const retainedLabel = await retainPage.locator('.retain-picker label').first().textContent();
await retainPage.locator('.retain-picker label').first().click();
await retainPage.locator('.play-button').click();
await retainPage.locator('.turn-actions button').click();
assert(await retainPage.locator('.hand-card').filter({ hasText: retainedLabel }).count() > 0, 'selected card is retained into next round');
await retainPage.close();
assert.deepEqual(errors, []);
await browser.close();
console.log('Desktop and mobile UI smoke passed; no runtime errors or horizontal overflow.');
