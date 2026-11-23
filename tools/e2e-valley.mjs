#!/usr/bin/env node
// Public valleys and the valley map end to end (OnFire "Hollow Valley", valley step 1; 05-valley-map.md), against a
// RUNNING multi-farm host with the world layer on (any base path):
//   HH_MODE=multi HH_BASE_PATH=/g/farm HH_HELPER=off HH_TELEMETRY=off HH_WORLD_SECRET=test HH_CREATE_PER_HOUR=50 \
//     HH_DATA_DIR=<scratch> PORT=3398 node server/index.js
//   BASE=http://127.0.0.1:3398/g/farm CHROME=<chrome> OUT=<dir> node tools/e2e-valley.mjs
// Four people start a farm each on the landing page (separate browser profiles), name their farmer and play: all four
// land in one public valley. Ana opens the valley map (desktop), Ben opens it on a phone-sized screen; Ana taps Ben's
// farm and flies into the read-only visit, then goes back home; Cleo turns "Show my farm in the valley" off and leaves
// everyone's map. Under a 4x CPU throttle it times the map (open to every thumbnail drawn) against one visit page boot.
// Screenshots go to OUT.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.BASE || 'http://127.0.0.1:3398/g/farm').replace(/\/+$/, '');
const OUT = process.env.OUT || 'e2e-valley-out';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (what, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${info ? `  ${info}` : ''}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (pg, name) => pg.screenshot({ path: `${OUT}/${name}.png` });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800', '--mute-audio'],
});

/** A new profile starts a farm on the landing page and sits down as `name` with colour `c`: { pg, farmId }. */
async function startFarm(name, c, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  await pg.setViewport(viewport);
  pg.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  await pg.goto(`${BASE}/`);
  await pg.waitForSelector('#ld-start');
  await pg.click('#ld-start');
  for (let i = 0; i < 450 && !/\/f\/[a-z2-7]{12}$/.test(new URL(pg.url()).pathname); i++) await sleep(200);
  try { await pg.waitForSelector('#slot-list input', { visible: true, timeout: 90_000 }); } catch (err) {
    await shot(pg, `fail-${name}`);
    console.log(`[${name}] at ${pg.url()}`);
    throw err;
  }
  await pg.type('#slot-list input', name);
  await pg.evaluate((i) => {
    const sw = [...document.querySelectorAll('#slot-list button')].filter((b) => !/play/i.test(b.textContent));
    sw[i % sw.length]?.click();
    [...document.querySelectorAll('#slot-list button')].find((b) => /play/i.test(b.textContent))?.click();
  }, c);
  await pg.waitForFunction(() => window.__hh?.pid === 'p1', { timeout: 60_000, polling: 100 });
  const farmId = await pg.evaluate(() => location.pathname.split('/').pop());
  await pg.waitForFunction((id) => {
    try { return JSON.parse(localStorage.getItem(`hh.world.${id}`))?.kind === 'public' && document.querySelector('.hhw-map'); } catch { return false; }
  }, { timeout: 90_000, polling: 200 }, farmId);
  const entry = await ent(pg, farmId);
  await park(pg);
  return { pg, farmId, ctx, entry };
}

/** A software-rendered farm page eats a CPU: pages not in use wait on about:blank (the device keeps its keys). */
const park = (pg) => pg.goto('about:blank');
async function visitHome(p) {
  await p.pg.goto(`${BASE}/f/${p.farmId}`);
  await p.pg.waitForFunction(() => window.__hh?.pid === 'p1' && document.querySelector('.hhw-map'), { timeout: 90_000, polling: 200 });
}

const ent = (pg, id) => pg.evaluate((x) => JSON.parse(localStorage.getItem(`hh.world.${x}`)), id);
/** Close whatever the game opened over the farm on a first visit (the guide, a tip): Escape a few times. */
async function settle(pg) { for (let i = 0; i < 3; i++) { await pg.keyboard.press('Escape'); await sleep(150); } }
async function openMap(pg) {
  await pg.click('.hhw-map');
  await pg.waitForSelector('.hhv-plot[data-farm]', { timeout: 15_000 });
  await pg.waitForFunction(() => {
    const p = window.__hhValley;
    const n = p?.roster?.members?.length ?? 0;
    return n > 0 && [...document.querySelectorAll('.hhv-plot[data-farm] canvas')].every((c) => c.width > 4);
  }, { timeout: 30_000, polling: 100 });
}

try {
  // 1. four farms from the landing page, four profiles
  const people = [];
  for (const [i, name] of ['Ana', 'Ben', 'Cleo', 'Dara'].entries()) people.push({ name, ...(await startFarm(name, i)) });
  const ents = people.map((p) => p.entry);
  check('4 farms from the landing page all joined ONE public valley', new Set(ents.map((e) => e.wid)).size === 1 && ents.every((e) => e.kind === 'public'),
    JSON.stringify(ents.map((e) => [e.seat, e.wid.slice(0, 8)])));
  check('seats in join order', ents.every((e, i) => i === 0 || e.seat === ents[i - 1].seat + 1), ents.map((e) => e.seat).join());
  const [ana, ben, cleo, dara] = people;

  // 2. Ana's map, desktop
  await visitHome(ana);
  await settle(ana.pg);
  await shot(ana.pg, 'farm-hud-desktop');
  await openMap(ana.pg);
  await sleep(500);
  await shot(ana.pg, 'valley-desktop');
  const plots = await ana.pg.evaluate(() => [...document.querySelectorAll('.hhv-plot[data-farm]')].map((b) => ({
    farm: b.dataset.farm, self: b.classList.contains('self'), text: b.querySelector('.hhv-farm')?.textContent })));
  check('the map shows the 4 farms, Ana\'s own marked', people.every((p) => plots.some((x) => x.farm === p.farmId))
    && plots.filter((p) => p.self).length === 1 && plots.find((p) => p.self).farm === ana.farmId, JSON.stringify(plots));
  check('empty plots fill the valley up to 8', (await ana.pg.$$('.hhv-plot.empty')).length === 8 - plots.length);

  // 3. Ben on a phone-sized screen (a new page of his profile)
  const phone = ben.pg;
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await visitHome(ben);
  await settle(phone);
  await shot(phone, 'farm-hud-phone');
  await openMap(phone);
  await sleep(500);
  await shot(phone, 'valley-phone');

  // 4. Ana taps Ben's farm: the fly-in, the read-only visit, the map from there, back home
  await ana.pg.click(`.hhv-plot[data-farm="${ben.farmId}"]`);
  await ana.pg.waitForFunction((id) => location.pathname.endsWith(`/w/visit/${id}`), { timeout: 15_000 }, ben.farmId);
  await ana.pg.waitForFunction(() => window.__hhVisit?.welcomed >= 1, { timeout: 60_000, polling: 100 });
  await sleep(2500);
  await shot(ana.pg, 'visit-ben');
  const visit = await ana.pg.evaluate(() => ({ owner: window.__hhVisit.owner, name: window.__hhVisit.state.players.p1.name,
    banner: document.getElementById('hhw-visit-banner')?.textContent }));
  check('the tap opened Ben\'s farm read-only', visit.name === 'Ben' && /Ben/.test(visit.banner), JSON.stringify(visit));
  const bens = await (await fetch(`${BASE}/api/w/roster`, { headers: { authorization: `Bearer ${ents[1].worldKey}` } })).json();
  check('Ben\'s roster counts one visitor on his farm', bens.members.find((m) => m.self).visitors === 1);
  await openMap(ana.pg);
  await shot(ana.pg, 'valley-from-visit');
  await ana.pg.click('.hhv-home');
  await ana.pg.waitForFunction((id) => location.pathname.endsWith(`/f/${id}`) && window.__hh?.pid === 'p1', { timeout: 60_000, polling: 100 }, ana.farmId);
  check('Back home: Ana is on her own farm again', true);
  await park(ana.pg);
  await park(phone);

  // 5. Cleo opts out in Settings > Farm
  await visitHome(cleo);
  await settle(cleo.pg);
  await cleo.pg.evaluate(() => window.__hh.ui.panels.open('settings'));
  await cleo.pg.waitForFunction(() => [...document.querySelectorAll('[role=tab], .tab, button')].some((b) => /^Farm$/.test(b.textContent.trim())), { timeout: 10_000 });
  await cleo.pg.evaluate(() => [...document.querySelectorAll('[role=tab], .tab, button')].find((b) => /^Farm$/.test(b.textContent.trim())).click());
  await cleo.pg.waitForSelector('[data-valley=show]', { timeout: 10_000 });
  await cleo.pg.evaluate(() => document.querySelector('[data-valley=show]').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await shot(cleo.pg, 'settings-valley-on');
  await cleo.pg.click('[data-valley=show]');
  await cleo.pg.waitForFunction(() => document.querySelector('[data-valley=show]')?.getAttribute('aria-checked') === 'false', { timeout: 10_000 });
  await sleep(300);
  await shot(cleo.pg, 'settings-valley-off');
  const after = await (await fetch(`${BASE}/api/w/roster`, { headers: { authorization: `Bearer ${ents[3].worldKey}` } })).json();
  check('opt-out: Cleo left the valley for everyone', !after.members.some((m) => m.farmId === cleo.farmId)
    && after.members.length === plots.length - 1, JSON.stringify(after.members.map((m) => m.name)));
  check('opt-out: Cleo\'s strip and world entry are gone', await cleo.pg.evaluate((id) => !document.querySelector('[data-hhw=strip]')
    && !localStorage.getItem(`hh.world.${id}`), cleo.farmId));
  await cleo.pg.reload();
  await cleo.pg.waitForFunction(() => window.__hh?.pid === 'p1', { timeout: 60_000, polling: 100 });
  await sleep(2000);
  check('opt-out sticks across a reload', await cleo.pg.evaluate(() => !document.querySelector('[data-hhw=strip]')));
  await park(cleo.pg);

  // 6. cost under a 4x CPU throttle (a mid phone): the map (open -> every thumbnail drawn) vs one visit page boot
  const cdp = await dara.pg.createCDPSession();
  await visitHome(dara);
  await settle(dara.pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await openMap(dara.pg);
  const mapMs = Date.now() - t0;
  const mperf = await dara.pg.evaluate(() => ({ ...window.__hhValley.perf }));
  await sleep(13_000);                                          // one thumbnail refresh round (ETag: 304s)
  const mperf2 = await dara.pg.evaluate(() => ({ ...window.__hhValley.perf }));
  const metrics = await cdp.send('Performance.getMetrics').catch(() => null);
  const t1 = Date.now();
  await dara.pg.goto(`${BASE}/w/visit/${ana.farmId}?from=${dara.farmId}`);
  await dara.pg.waitForFunction(() => window.__hhVisit?.welcomed >= 1, { timeout: 120_000, polling: 100 });
  const visitMs = Date.now() - t1;
  console.log(`perf (4x CPU throttle): map open -> every thumbnail drawn ${mapMs} ms; draws ${mperf.draws} in ${mperf.drawMs.toFixed(1)} ms `
    + `(${(mperf.drawMs / Math.max(1, mperf.draws)).toFixed(2)} ms each); refresh round: ${mperf2.fetches - mperf.fetches} fetches, `
    + `${mperf2.notModified - mperf.notModified} unchanged (304), ${mperf2.draws - mperf.draws} redraws; one visit page boot ${visitMs} ms`);
  void metrics;
  check('the map is cheaper than one visit page', mapMs < visitMs, `${mapMs} vs ${visitMs}`);
} catch (err) {
  console.log('FAIL', err.stack);
  fails++;
} finally {
  await browser.close();
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
