import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.RELEASE_URL || 'http://127.0.0.1:4174/ace405-card-lab/';
const output = process.env.RELEASE_OUTPUT || 'Art/renders';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--use-angle=d3d11'] });
const report = { base, views:[], errors:[] };
try {
  const page = await browser.newPage();
  for (const route of ['', 'v1/']) {
    await page.goto(base + route);
    await page.locator('.level-list').waitFor();
    assert.equal(await page.locator('.intro-hero').count(), 0, 'legacy route retains original UI');
    const version = await (await page.request.get(base + route + 'version.json')).json();
    assert.equal(version.version, 'v1');
    assert.equal(version.commit, 'db7f5ea70d0be71dad2ff95904717fc7448697e7');
  }
  const release = await (await page.request.get(base + 'versions.json')).json();
  assert.equal(release.current, 'v2');
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const game = await browser.newPage({ viewport, hasTouch:true });
    let closing = false;
    game.on('pageerror', error => report.errors.push(error.message));
    game.on('requestfailed', request => { if(!closing)report.errors.push(`${request.url()}: ${request.failure()?.errorText}`); });
    game.on('response', response => { if(response.status()>=400)report.errors.push(`${response.status()}: ${response.url()}`); });
    await game.goto(base + 'v2'); // Verify the trailing-slash directory redirect too.
    assert.equal(new URL(game.url()).pathname, new URL(base+'v2/').pathname);
    await game.locator('.intro-hero').evaluate(image => image.decode());
    assert.equal(await game.title(), '建筑竞标实验室 · ACE405 · v2');
    await game.locator('.level-list button').last().tap();
    await game.locator('.primary').tap();
    await game.waitForSelector('.scene-host[data-assets="ready"]');
    assert.equal(await game.locator('.scene-fallback').count(), 0);
    assert.equal(await game.evaluate(() => document.documentElement.scrollWidth>innerWidth), false);
    const card = game.locator('.hand-card.design-card:not(.muted)').first();
    const id = await card.getAttribute('data-card-id');
    await card.tap(); await game.locator('.install-button').tap();
    await game.locator(`.player .building-slots [data-card-id="${id}"]`).waitFor();
    await game.getByRole('button',{name:'玩法说明',exact:true}).click();
    await game.getByRole('button',{name:'关闭玩法说明'}).click();
    await game.locator('.battle-status button').click();
    await game.getByRole('button',{name:'关闭牌组'}).click();
    await game.screenshot({path:`${output}/release-v2-${viewport.width}.png`});
    report.views.push({...viewport,installed:id,assets:await game.locator('.scene-host').getAttribute('data-assets')});
    closing = true; await game.close();
  }
  const review = await browser.newPage();
  review.on('pageerror', error=>report.errors.push(error.message));
  await review.goto(base+'v2/?renderReview&cards=W2,I2,S2,P2,M2,T2');
  await review.waitForSelector('.render-review[data-ready="true"]');
  await review.getByRole('button',{name:'查看 Blender 参考'}).click();
  await review.locator('.render-review img').evaluate(image=>image.decode());
  await review.getByRole('link',{name:'长椅坐姿',exact:true}).click();
  await review.waitForSelector('.render-review[data-ready="true"]');
  await review.getByRole('button',{name:'查看 Blender 参考'}).click();
  await review.locator('.render-review img').evaluate(image=>image.decode());
  assert.match(await review.locator('.render-review img').getAttribute('src'),/reference-seated\.png/);
  await review.getByRole('button',{name:'查看网页实时效果'}).click();
  await review.getByRole('button',{name:'播放人物与门动画'}).click();
  await review.waitForTimeout(15000); // Rest, stand up, then walk away in the production build.
  await review.screenshot({path:`${output}/release-v2-seated-after-animation.png`});
  report.seatingPreview={loaded:true,reference:true,animation:true};
  await review.getByRole('link',{name:'返回游戏'}).click();
  assert.equal(new URL(review.url()).pathname,new URL(base+'v2/').pathname);
  const assets = base+'v2/assets/modern-v2/';
  const manifest = await (await page.request.get(assets+'components-manifest.json')).json();
  assert.equal(Object.keys(manifest.cards).length,24);
  for(const id of Object.keys(manifest.cards))assert.equal((await page.request.get(assets+'cards/'+id+'.png')).status(),200);
  assert.deepEqual(report.errors,[]);
  await writeFile(process.env.RELEASE_REPORT || 'validation/release-smoke-v2.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
