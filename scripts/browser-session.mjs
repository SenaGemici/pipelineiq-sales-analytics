import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function withBrowser(task, { output = '.next/qa/crm' } = {}) {
  fs.mkdirSync(output, { recursive: true });
  const browser = spawn(process.env.PIPELINEIQ_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${path.resolve(output, `chrome-${Date.now()}`)}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  const deadline = setTimeout(() => { console.error('Browser check timed out'); socket?.close(); browser.kill(); process.exit(1); }, 180000);
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      browser.on('error', reject);
      browser.on('exit', code => reject(new Error(`Chrome exited before ready: ${code}`)));
      browser.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    });
    const origin = new URL(endpoint).origin.replace('ws:', 'http:');
    const pages = await (await fetch(`${origin}/json`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0;
    const pending = new Map(), errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { const call = pending.get(message.id); pending.delete(message.id); if (message.error) call.reject(new Error(JSON.stringify(message.error))); else call.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    };
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const run = async expression => {
      // Next.js 16 can retain inactive routes in hidden Activity trees.
      // Scope DOM queries to rendered elements, as a person using the app would.
      const scoped = `((document) => (${expression}))(new Proxy(globalThis.document, { get(target, property) {
        if (property === 'querySelector' || property === 'querySelectorAll') return selector => {
          const matches = [...target.querySelectorAll(selector)].filter(element => element.checkVisibility());
          return property === 'querySelector' ? matches[0] ?? null : matches;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }}))`;
      const result = await cdp('Runtime.evaluate', { expression: scoped, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const wait = async (expression, message = expression) => { for (let i=0;i<120;i++) { if (await run(expression)) return; await pause(150); } throw new Error(`Timed out: ${message}`); };
    const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(80); };
    const input = async (selector, value) => {
      await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Field not found: '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
      await pause(80);
    };
    const resize = async width => { await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: width <= 900 }); await pause(200); };
    const screenshot = async name => { const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64')); };
    await cdp('Runtime.enable'); await resize(1440);
    await task({ cdp, run, wait, click, input, pause, resize, screenshot });
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
  } finally { clearTimeout(deadline); socket?.close(); browser.kill(); }
}
