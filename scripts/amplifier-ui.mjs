import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  for (const [width,height] of [[844,390],[390,844],[1440,900]]) {
    const page = await browser.newPage({viewport:{width,height},hasTouch:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    let fixture;
    await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`)});
    });
    const base={...initialGame(),phase:'battle',level:5,round:5,energy:3,hand:['F03','S2','F07','I4','F08'],npcBoard:['W2']};
    const load=async extra=>{fixture={...base,...extra};await page.goto('http://127.0.0.1:5173/');await page.locator('[data-card-id="F07"].hand-card').tap();};
    await load({});
    assert.match(await page.locator('.energy-display').innerText(),/3/);
    assert.equal(await page.locator('.selection-hint').innerText(),'没有能反制当前对手装置的手牌');
    assert(await page.locator('.play-button').isDisabled());
    await load({npcBoard:['S2']});
    assert(await page.locator('.play-button').isEnabled());
    await page.locator('.play-button').tap();
    assert.equal(await page.locator('.hand-card[data-card-id="F07"]').count(),0);
    await page.locator('.hand-card[data-card-id="S2"]').tap();
    await page.locator('.metric-select').selectOption('H');
    assert(await page.locator('.counter-button').isEnabled());
    await page.locator('.counter-button').tap();
    assert.equal(await page.locator('.hand-card[data-card-id="S2"]').count(),0);
    await load({npcBoard:['S2'],energy:1});
    assert.equal(await page.locator('.selection-hint').innerText(),'强化并反制共需 2 点体力，当前 1 点');
    assert(await page.locator('.play-button').isDisabled());
    await load({hand:['F07','F06'],functions:1});
    assert.equal(await page.locator('.selection-hint').innerText(),'功能次数不足：强化后无法再打压制牌');
    assert(await page.locator('.play-button').isDisabled());
    assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: accurate amplifier hints and complete boosted counter passed`);
    await page.close();
  }
} finally {await browser.close();}
