import assert from 'node:assert/strict';
import { withBrowser } from './browser-session.mjs';
const base = process.argv[2] || 'http://localhost:3000';
const key = 'pipelineiq.demo.v1';
await withBrowser(async ({ cdp, run, wait, click, input, pause, resize, screenshot }) => {
  const stored = () => run(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const heading = text => wait(`document.querySelector('h1')?.textContent === ${JSON.stringify(text)}`);
  const nav = async (href, title) => { await click(`aside nav a[href="${href}"]`); await heading(title); await pause(100); };
  const submit = async () => { await click('dialog[open] button[type=submit]'); await wait('!document.querySelector("dialog[open]")','Form saved; '+await run('document.querySelector("dialog[open]")?.innerText')); };
  const dd = () => run('[...document.querySelectorAll("main dl dd")].map(e=>e.textContent)');
  await cdp('Page.navigate',{url:base});await heading('Genel Bakış');await wait('!!document.querySelector(".recharts-bar-rectangle path")');
  assert.deepEqual(await dd(),['$580.000','8','%75','$316.000']);
  assert.deepEqual(await run('[...document.querySelectorAll(".recharts-bar-rectangle path")].map(e=>e.getAttribute("fill"))'),['#60a5fa','#2dd4bf','#a78bfa','#fbbf24']);
  await screenshot('overview-approved.png');

  await nav('/satis-firsatlari','Satış Fırsatları');
  assert.equal(await run('document.querySelectorAll("[data-stage]").length'),6);
  assert.equal(await run('document.querySelectorAll("article[data-opportunity-id]").length'),16);
  await run('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Yeni fırsat")).click()');
  await wait('!!document.querySelector("dialog[open] form")');
  await input('[name=opportunityName]','Tarayıcı Testi Platform Lisansı');
  await input('[name=value]','10000');await input('[name=ownerId]','rep-2');await input('[name=probability]','50');await input('[name=closeDate]','2026-11-20');
  assert(await run('document.querySelector("dialog[open]").contains(document.activeElement)'));
  await screenshot('opportunity-form-1440.png');
  for (const width of [390,320]) {
    await resize(width);
    assert(await run('document.documentElement.scrollWidth<=innerWidth'), 'Opportunity form has no horizontal overflow');
    assert(await run('document.querySelector("dialog[open]").getBoundingClientRect().right<=innerWidth'));
  }
  await screenshot('opportunity-form-320.png');await resize(1440);
  await submit();
  let state=await stored();let op=state.opportunities.find(op=>op.name==='Tarayıcı Testi Platform Lisansı');assert(op);const fullId=op.id;
  assert.equal(state.opportunities.length,17);assert.equal(op.value,10000);assert.equal(op.ownerId,'rep-2');
  await nav('/','Genel Bakış');assert.deepEqual((await dd()).slice(0,2),['$590.000','9']);assert.equal((await dd())[3],'$321.000');
  await nav('/satis-firsatlari','Satış Fırsatları');
  await input('[aria-label="Satış fırsatlarında ara"]','Tarayıcı Testi');assert.equal(await run('document.querySelectorAll("article[data-opportunity-id]").length'),1);
  await click('button[aria-label="Aramayı temizle"]');
  await input('[aria-label="Sorumlu filtresi"]','rep-2');assert((await run('[...document.querySelectorAll("article[data-opportunity-id]")].map(e=>e.dataset.opportunityId)')).includes(fullId));
  await input('[aria-label="Sorumlu filtresi"]','all');
  // Native Chromium drag/drop events exercise the board drop target and React update.
  assert(await run(`document.querySelector('[data-opportunity-id="${fullId}"]').draggable`));
  await run('document.querySelector(\'[data-stage="Closed Won"]\').scrollIntoView({block:"nearest",inline:"center"})');
  const destination=await run('(()=>{const r=document.querySelector(\'[data-stage="Closed Won"]\').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100};})()');
  const dragData={items:[{mimeType:'text/plain',data:fullId}],dragOperationsMask:16};
  for(const type of ['dragEnter','dragOver','drop'])await cdp('Input.dispatchDragEvent',{type,...destination,data:dragData});
  await wait(`JSON.parse(localStorage.getItem('${key}')).opportunities.find(op=>op.id==='${fullId}').stage === 'Closed Won'`);
  state=await stored();op=state.opportunities.find(op=>op.id===fullId);assert.equal(op.probability,100);assert.equal(op.closedAt,'2026-11-01');
  await nav('/','Genel Bakış');assert.equal((await dd())[0],'$580.000');assert.equal((await dd())[2],'%78');assert.equal((await dd())[3],'$316.000');
  await nav('/satis-firsatlari','Satış Fırsatları');
  await run(`document.querySelector('[data-opportunity-id="${fullId}"] button').click()`);await wait('!!document.querySelector("dialog[open]")');
  assert((await run('document.querySelector("dialog[open]").innerText')).includes('Satış Fırsatı Detayı'));
  await run('[...document.querySelectorAll("dialog[open] button")].find(e=>e.textContent==="Düzenle").click()');await input('[name=value]','12000');await submit();
  await input(`[data-opportunity-id="${fullId}"] select`,'Negotiation');
  state=await stored();op=state.opportunities.find(op=>op.id===fullId);assert.equal(op.probability,80);assert.equal(op.closedAt,null);assert.equal(op.value,12000);
  console.log('PASS Sales: add, detail, edit, native drop, accessible stage change, filters and cross-page KPIs.');

  await nav('/sirketler','Şirketler');
  await run('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Yeni şirket")).click()');
  await input('[name=companyName]','Tarayıcı Bulut');await input('[name=sector]','SaaS');await input('[name=contactName]','Deniz Test');await input('[name=contactEmail]','deniz@example.com');await submit();
  state=await stored();let company=state.companies.find(c=>c.name==='Tarayıcı Bulut');assert(company);const companyId=company.id;
  await input('[aria-label="Şirketlerde ara"]','Tarayıcı Bulut');assert.equal(await run('document.querySelectorAll("tbody tr").length'),1);
  await input('[aria-label="Sektör filtresi"]','SaaS');
  await run('document.querySelector("tbody tr button").click()');await wait('!!document.querySelector("dialog[open]")');
  await run('[...document.querySelectorAll("dialog[open] button")].find(e=>e.textContent==="Şirketi düzenle").click()');
  await input('[name=companyName]','Tarayıcı Bulut Güncel');await submit();
  await run('document.querySelector("tbody tr button").click()');
  await run('[...document.querySelectorAll("dialog[open] button")].find(e=>e.textContent.includes("Yeni fırsat")).click()');
  await wait('!!document.querySelector("dialog[open] form")');assert.equal(await run('document.querySelector("[name=companyId]").value'),companyId);
  await input('[name=opportunityName]','Eksik Veri Testi');await submit();
  state=await stored();op=state.opportunities.find(op=>op.name==='Eksik Veri Testi');const missingId=op.id;assert.equal(op.companyId,companyId);assert.equal(op.value,null);assert.equal(op.ownerId,null);assert.equal(op.closeDate,null);
  await run('document.querySelector("tbody tr button").click()');assert((await run('document.querySelector("dialog[open]").innerText')).includes('Eksik Veri Testi'));
  await click('button[aria-label="Paneli kapat"]');
  console.log('PASS Companies: create/edit, search/sector filter, normalized relationship and related opportunity creation.');

  await nav('/veri-kalitesi','Veri Kalitesi');
  const row=`[data-quality-opportunity="${missingId}"]`;
  await wait(`!!document.querySelector('${row}')`);assert((await run(`document.querySelector('${row}').innerText`)).includes('30'));
  await input('[aria-label="Önem derecesi filtresi"]','critical');assert.equal(await run('document.querySelectorAll("tbody tr").length'),1);
  await click(`${row} button`);await input('[name=value]','2500');await input('[name=ownerId]','rep-1');await input('[name=closeDate]','2026-11-30');await submit();
  assert.equal(await run(`document.querySelector('${row}')`),null);
  await input('[aria-label="Önem derecesi filtresi"]','all');assert.equal(await run('document.querySelectorAll("tbody tr").length'),2);
  await nav('/','Genel Bakış');assert.deepEqual(await dd(),['$594.500','10','%75','$326.475']);
  console.log('PASS Quality: missing-field score 30/100, critical filter, correction, immediate score/KPI recalculation.');

  await nav('/analizler','Analizler');assert.equal((await dd())[1],'$326.475');assert.equal(await run('document.querySelectorAll(".recharts-bar-rectangle path").length'),6);
  await input('[aria-label="Analiz sorumlusu"]','rep-2');assert.equal(await run('document.querySelectorAll("tbody tr").length'),1);
  await input('[aria-label="Analiz sorumlusu"]','all');
  console.log('PASS Analytics: shared forecast, six-stage distribution, representative filter/performance.');

  await nav('/ayarlar','Ayarlar');await input('#currency-display','code');await input('#date-format','iso');
  assert((await run('document.querySelector("[data-settings-preview]").innerText')).includes('USD'));assert((await run('document.querySelector("[data-settings-preview]").innerText')).includes('2026-11-01'));
  await nav('/satis-firsatlari','Satış Fırsatları');assert((await run(`document.querySelector('[data-opportunity-id="${fullId}"]').innerText`)).includes('USD'));
  assert((await run(`document.querySelector('[data-opportunity-id="${fullId}"]').innerText`)).includes('2026-11-20'));
  await cdp('Page.reload');await heading('Satış Fırsatları');await wait('document.querySelectorAll("article[data-opportunity-id]").length===18');
  state=await stored();assert.equal(state.companies.length,17);assert.equal(state.preferences.currencyDisplay,'code');assert.equal(state.opportunities.find(op=>op.id===fullId).value,12000);
  assert((await run('document.querySelector("main").innerText')).includes('Tarayıcı Bulut Güncel'));
  console.log('PASS Persistence/Settings: currency/date preferences, added/edited opportunities and companies survive a browser reload.');

  await nav('/ayarlar','Ayarlar');
  await run('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Demo verilerini sıfırla")).click()');
  await run('[...document.querySelectorAll("dialog[open] button")].find(e=>e.textContent==="Vazgeç").click()');assert.equal((await stored()).opportunities.length,18);
  await run('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Demo verilerini sıfırla")).click()');
  await run('[...document.querySelectorAll("dialog[open] button")].find(e=>e.textContent==="Evet, sıfırla").click()');await wait('!document.querySelector("dialog[open]")');
  state=await stored();assert.equal(state.opportunities.length,16);assert.equal(state.companies.length,16);assert.equal(state.preferences.currencyDisplay,'symbol');assert.equal(state.preferences.dateFormat,'tr');
  await nav('/','Genel Bakış');assert.deepEqual(await dd(),['$580.000','8','%75','$316.000']);
  await cdp('Page.reload');await heading('Genel Bakış');await wait('document.querySelectorAll(".recharts-bar-rectangle path").length===4');assert.deepEqual(await dd(),['$580.000','8','%75','$316.000']);
  console.log('PASS Reset: cancel preserves changes; confirmation restores seed, preferences and dashboard metrics after reload.');

  const pages=[['/','Genel Bakış'],['/satis-firsatlari','Satış Fırsatları'],['/sirketler','Şirketler'],['/veri-kalitesi','Veri Kalitesi'],['/analizler','Analizler'],['/ayarlar','Ayarlar']];
  for(const [href,title] of pages){await resize(1440);await nav(href,title);assert.equal(await run('document.querySelector("aside nav [aria-current=page]").getAttribute("href")'),href);
    for(const width of [1440,1024,390,320]){await resize(width);assert(await run('document.documentElement.scrollWidth<=innerWidth'),`${title} overflows at ${width}`);if(width===1440||width===390)await screenshot(`${href.slice(1)||'genel-bakis'}-${width}.png`);}
  }
  await resize(1440);await click('button[aria-label="Menüyü daralt"]');await nav('/sirketler','Şirketler');assert.equal(await run('document.querySelector("aside").getBoundingClientRect().width'),72);
  await click('button[aria-label="Menüyü genişlet"]');
  console.log('PASS Responsive: all six screens at 1440/1024/390/320 px, active navigation and persistent sidebar state.');
});
