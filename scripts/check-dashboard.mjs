// Dependency-free Chromium/CDP regression check. Run with Node 22+.
// Usage: node scripts/check-dashboard.mjs http://localhost:3000 http://localhost:3100
// Set PIPELINEIQ_BROWSER_PATH to use another Chromium executable.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve('.next/qa');
fs.mkdirSync(output, { recursive: true });
const executable = process.env.PIPELINEIQ_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = spawn(executable, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let websocket;
const deadline = setTimeout(() => { console.error('Browser check timed out'); websocket?.close(); browser.kill(); process.exit(1); }, 90000);

async function main() {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    browser.on('error', reject);
    browser.on('exit', code => reject(new Error(`Chromium exited before debugging was ready: ${code}`)));
    browser.stderr.on('data', data => {
      log += data;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    });
  });
  const origin = new URL(endpoint).origin.replace('ws:', 'http:');
  const pages = await (await fetch(`${origin}/json`)).json();
  websocket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { websocket.onopen = resolve; websocket.onerror = reject; });
  const pending = new Map(), errors = [];
  let sequence = 0;
  websocket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(new Error(JSON.stringify(message.error))); else call.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    websocket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const resize = async width => {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: width <= 900 });
    await pause(250);
  };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async value => {
    const windowsVirtualKeyCode = { Escape: 27, Enter: 13, Tab: 9 }[value];
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, windowsVirtualKeyCode, text: value === 'Enter' ? '\r' : undefined });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, windowsVirtualKeyCode });
    await pause(100);
  };
  const screenshot = async name => {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64'));
  };
  await cdp('Runtime.enable');
  const urls = process.argv.slice(2);
  if (!urls.length) urls.push('http://localhost:3000');

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    await resize(1440);
    await cdp('Page.navigate', { url });
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await run('!!document.querySelector("[data-dashboard] dl dd")')) break;
      await pause(250);
    }
    await pause(700);
    assert.equal(await run('document.documentElement.lang'), 'tr');
    assert.equal(await run('document.querySelector("h1").textContent'), 'Genel Bakış');
    assert.deepEqual(await run('[...document.querySelectorAll("dl dd")].map(e=>e.textContent)'), ['$580.000', '8', '%75', '$316.000']);
    assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 0, 'Tooltips hidden initially');
    assert(await run('[...document.querySelectorAll("aside nav a")].every(e => getComputedStyle(e).borderTopWidth === "0px" && getComputedStyle(e).outlineStyle === "none")'), 'No outlines/boxes around nav items');
    assert(await run('document.querySelector("select").previousElementSibling.offsetWidth === 1'), 'Filter label is visually hidden');

    for (const width of [1440, 1280, 1024, 901, 900, 768, 680, 390, 320]) {
      await resize(width);
      const metrics = await run(`(()=>{
        const list = document.querySelector('dl');
        const rects = [...list.children].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,width:r.width,bg:getComputedStyle(e).backgroundColor};});
        return {display:getComputedStyle(list).display,columns:getComputedStyle(list).gridTemplateColumns.split(' ').length,rects,overflow:document.documentElement.scrollWidth>innerWidth};
      })()`);
      assert.equal(metrics.display, 'grid');
      assert.equal(metrics.columns, width <= 680 ? 2 : 4, `${width}: KPI columns`);
      assert(!metrics.overflow, `${width}: no page overflow`);
      assert(metrics.rects.every(r => Math.abs(r.width - metrics.rects[0].width) <= 1), `${width}: equal KPI width`);
      assert(metrics.rects.every(r => r.bg === 'rgb(255, 255, 255)'), 'White KPI surfaces');
      if (width > 680) assert(metrics.rects.every(r => Math.abs(r.top - metrics.rects[0].top) <= 1), `${width}: one KPI row`);
      assert.equal(await run('document.querySelectorAll(".recharts-bar-rectangle path").length'), 4, `${width}: bars drawn`);
      assert(await run('!!document.querySelector(".recharts-area-curve")'), `${width}: revenue drawn`);
      assert(await run(`(()=>{const header=document.querySelector('header'),start=header.firstElementChild,last=header.lastElementChild;const a=start.getBoundingClientRect(),b=last.getBoundingClientRect();return Math.abs((a.top+a.height/2)-(b.top+b.height/2))<2;})()`), 'Header alignment');
      if (width === 1440 || width === 390) await screenshot(`${index ? 'production' : 'development'}-${width}.png`);
    }
    await resize(1440);
    const before = await run('document.querySelector("main").getBoundingClientRect().width');
    assert.equal(await run('document.querySelector("aside").getBoundingClientRect().width'), 240);
    await click('button[aria-label="Menüyü daralt"]'); await pause(100);
    assert.equal(await run('document.querySelector("aside").getBoundingClientRect().width'), 72);
    assert.equal(await run('document.querySelector("main").getBoundingClientRect().width'), before + 168);
    assert(await run('[...document.querySelectorAll("aside nav a span")].every(e=>getComputedStyle(e).display === "none")'));
    await screenshot(`${index ? 'production' : 'development'}-collapsed.png`);
    await click('button[aria-label="Menüyü genişlet"]');

    // Hover, focus, Enter/Space-equivalent click, Escape and outside dismissal.
    const infoSelector = 'button[aria-label="Kazanma Oranı nasıl hesaplanır?"]';
    const point = await run(`(()=>{const r=document.querySelector(${JSON.stringify(infoSelector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point }); await pause(100);
    assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 1);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 }); await pause(250);
    assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 0);
    await run(`document.querySelector(${JSON.stringify(infoSelector)}).focus()`); await pause(100);
    assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 1);
    assert(await run(`(()=>{const t=document.querySelector('[role=tooltip]').getBoundingClientRect(),k=document.querySelector('button[aria-label="Kazanma Oranı nasıl hesaplanır?"]').closest('dl > div').getBoundingClientRect();return t.left>=k.left && t.right<=k.right && t.top>=k.bottom;})()`), 'Tooltip inside horizontal card boundaries, below KPIs');
    await screenshot(`${index ? 'production' : 'development'}-tooltip.png`);
    await key('Escape'); assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 0);
    await key('Enter'); assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 1);
    await run('document.querySelector("h1").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');await pause(100);
    assert.equal(await run('document.querySelectorAll("[role=tooltip]").length'), 0);
    await resize(390);
    await click('button[aria-label="Menüyü aç"]');await pause(100);
    assert(await run('document.querySelector("dialog").open'));
    assert(await run('document.querySelector("dialog").contains(document.activeElement)'));
    assert.equal(await run('document.querySelector("[aria-haspopup=dialog]").getAttribute("aria-expanded")'), 'true');
    await screenshot(`${index ? 'production' : 'development'}-drawer.png`);
    await key('Escape');assert.equal(await run('document.querySelector("dialog").open'),false);
    assert.equal(await run('document.activeElement.getAttribute("aria-label")'),'Menüyü aç');
    assert.equal(await run('document.body.style.overflow'),'');
    await click('button[aria-label="Menüyü aç"]');await resize(1024);
    assert.equal(await run('document.querySelector("dialog").open'),false);
    assert.equal(await run('document.body.style.overflow'),'');

    const search = async value => {
      await run(`(()=>{const e=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(100);
    };
    await search('Nexora');assert.equal(await run('document.querySelectorAll("tbody tr").length'),1);
    await click('button[aria-label="Aramayı temizle"]');await pause(100);
    await run(`(()=>{const e=document.querySelector('select');e.value='oct';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);
    assert.deepEqual(await run('[...document.querySelectorAll("dl dd")].map(e=>e.textContent)'),['$64.000','1','%50','$51.200']);
    await run('window.__csv=null;URL.createObjectURL=b=>{window.__csv=b;return "blob:qa"};HTMLAnchorElement.prototype.click=function(){};[...document.querySelectorAll("button")].find(e=>e.textContent.includes("Rapor indir")).click()');
    const csv = await run('window.__csv.text()');assert(csv.includes('Fırsat No'));assert(csv.includes('Kazanıldı'));assert.equal(csv.split('\r\n').length,4);
    await search('eşleşmeyen');assert((await run('document.querySelector("main").innerText')).includes('Satış fırsatı bulunamadı'));
    console.log(`PASS ${url}: 9 viewport widths, KPI grid, header, rendered charts, 240/72 menu and content width, mobile drawer/focus/Escape/resize, tooltip visibility/hover/keyboard/bounds, search, filter, CSV and empty state.`);
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(deadline);
  websocket?.close();
  browser.kill();
});
