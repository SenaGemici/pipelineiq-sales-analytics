// Veri, hesaplama ve state testleri. Çalıştırma: node --test scripts/check-data.mjs
// Ham veride bilerek eklenen sorunların temizlendiği ve uygulama metriklerinin temiz CSV ile aynı olduğu doğrulanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const load = createRequire(import.meta.url);
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createInitialState, asOfDate, stallDays, dataVersion } = load('../lib/seed.ts');
const { applyAction } = load('../lib/crm-state.ts');
const { selectOpportunities, salesCycle, monthKeys, monthlyRevenue, companyMetrics, representativePerformance, productPerformance } = load('../lib/selectors.ts');
const { summarize, quarterPeriods } = load('../lib/pipeline.ts');
const { overallQuality, scoreOpportunity } = load('../lib/quality.ts');
const { validDate, daysBetween, formatDate } = load('../lib/dates.ts');
const { createDemoStore, storageKey } = load('../lib/demo-store.ts');
const { buildCsv } = load('../lib/presentation.ts');
const { dataProfile } = load('../lib/generated/data-profile.ts');

const readCsv = (dir, name) => {
  const [header, ...lines] = fs.readFileSync(new URL(`../data/${dir}/${name}.csv`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  const columns = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [columns[i], value])));
};
const tables = dir => ({ pipeline: readCsv(dir, 'sales_pipeline'), accounts: readCsv(dir, 'accounts'), products: readCsv(dir, 'products'), teams: readCsv(dir, 'sales_teams') });
const raw = tables('raw'), clean = tables('clean');
const price = Object.fromEntries(clean.products.map(p => [p.product, Number(p.sales_price)]));
const close = (actual, expected, digits = 2) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} ≠ ${expected}`);
const stepRows = title => dataProfile.steps.find(step => step.title === title)?.rows ?? 0;
const base = createInitialState();
const views = state => selectOpportunities(state);
const find = (state, predicate) => state.opportunities.find(predicate);

test('veri: temiz tablolar eksiksiz yüklendi, kimlikler tekil ve referanslar geçerli', () => {
  assert.equal(base.opportunities.length, clean.pipeline.length);
  assert.equal(base.companies.length, clean.accounts.length);
  assert.equal(base.representatives.length, clean.teams.length);
  assert.equal(base.products.length, clean.products.length);
  assert.equal(new Set(base.opportunities.map(op => op.id)).size, base.opportunities.length);
  const ids = key => new Set(base[key].map(item => item.id));
  const companies = ids('companies'), products = ids('products'), reps = ids('representatives');
  for (const op of base.opportunities) {
    assert.ok(products.has(op.productId)); assert.ok(reps.has(op.ownerId));
    if (op.companyId) assert.ok(companies.has(op.companyId));
  }
  assert.equal(base.opportunities.filter(op => !op.companyId).length, clean.pipeline.filter(r => !r.account).length);
  assert.ok(dataProfile.checks.filter(check => check.name !== 'Fırsat → şirket').every(check => check.failing === 0));
});

test('temizlik: ham veride bilerek eklenen her sorun temiz veride giderildi', () => {
  const legal = new Set(['a.ş.', 'a.s.', 'as', 'ltd.', 'ltd', 'şti.', 'şti', 'sti.', 'sti']);
  const key = value => value.toLocaleLowerCase('tr-TR').replaceAll('ı', 'i').split(/\s+/).filter(word => !legal.has(word)).join('').normalize('NFD').replace(/[^a-z0-9]/g, '');
  // Tekrarlanan satırlar
  const rawLines = raw.pipeline.map(r => JSON.stringify(r));
  assert.ok(new Set(rawLines).size < rawLines.length, 'ham veride tekrarlanan satır olmalı');
  assert.equal(clean.pipeline.length, new Set(rawLines).size);
  // Tarih biçimleri
  assert.ok(raw.pipeline.some(r => /^\d{2}\.\d{2}\.\d{4}$/.test(r.engage_date)));
  assert.ok(clean.pipeline.every(r => !r.engage_date || validDate(r.engage_date)) && clean.pipeline.every(r => !r.close_date || validDate(r.close_date)));
  // Ürün ve temsilci adları
  const productNames = new Set(clean.products.map(p => p.product)), repNames = new Set(clean.teams.map(t => t.sales_agent));
  assert.ok(raw.pipeline.some(r => !productNames.has(r.product))); assert.ok(raw.pipeline.some(r => !repNames.has(r.sales_agent)));
  assert.ok(views(base).every(op => productNames.has(op.product) && repNames.has(op.owner)));
  // Mükerrer şirketler ve yazım farkları
  assert.ok(new Set(raw.accounts.map(a => key(a.account))).size < raw.accounts.length, 'ham veride mükerrer şirket olmalı');
  assert.equal(new Set(base.companies.map(c => key(c.name))).size, base.companies.length);
  assert.equal(base.companies.length, raw.accounts.length - stepRows('Mükerrer şirketler birleştirildi'));
  for (const typo of ['Teknolji', 'ÜRETİM', 'perakende', 'Saglik']) assert.ok(!base.companies.some(c => c.sector === typo), typo);
  for (const typo of ['Istanbul', 'istanbul', 'İST', 'ANKARA', 'Izmir', 'Eskisehir']) assert.ok(!base.companies.some(c => c.city === typo), typo);
  // Tarih sırası
  assert.ok(base.opportunities.every(op => !op.createdAt || !op.closedAt || op.createdAt <= op.closedAt));
});

test('metrikler: uygulama hesapları temiz CSV ile aynı sonucu verir', () => {
  const s = summarize(views(base));
  const won = clean.pipeline.filter(r => r.deal_stage === 'Won'), lost = clean.pipeline.filter(r => r.deal_stage === 'Lost');
  const open = clean.pipeline.filter(r => r.deal_stage === 'Prospecting' || r.deal_stage === 'Engaging');
  assert.equal(s.wonCount, won.length); assert.equal(s.closedCount, won.length + lost.length); assert.equal(s.open.length, open.length);
  close(s.winRate, won.length / (won.length + lost.length) * 100);
  close(s.wonRevenue, won.reduce((sum, r) => sum + Number(r.close_value || 0), 0));
  close(s.total, open.reduce((sum, r) => sum + price[r.product], 0));
  close(s.lostPotential, lost.reduce((sum, r) => sum + price[r.product], 0));
  assert.equal(s.stages.reduce((sum, stage) => sum + stage.count, 0), base.opportunities.length);
  assert.ok(s.open.every(op => op.estimated && op.amount === op.listPrice));
});

test('metrikler: satış süresi, aylık gelir ve gruplamalar tutarlı', () => {
  const data = views(base), s = summarize(data);
  const cycle = salesCycle(base.opportunities);
  assert.equal(cycle.count, s.won.filter(op => op.createdAt).length); // tarihi boşaltılan kayıtlar satış süresine girmez assert.equal(cycle.median, dataProfile.metrics.cycleMedian);
  const closed = data.filter(op => op.closedAt).map(op => op.closedAt).sort();
  const months = monthlyRevenue(data, monthKeys(closed[0], closed.at(-1)));
  close(months.reduce((sum, m) => sum + m.revenue, 0), s.wonRevenue);
  const periods = quarterPeriods(data.map(op => op.closedAt));
  assert.equal(periods[0].key, `${asOfDate.slice(0, 4)}-Q${Math.floor((Number(asOfDate.slice(5, 7)) - 1) / 3) + 1}`); assert.equal(periods.at(-1).start <= closed[0], true); assert.equal(periods.at(-1).end >= closed[0], true);
  assert.equal(periods.reduce((sum, p) => sum + data.filter(op => op.closedAt && op.closedAt >= p.start && op.closedAt <= p.end).length, 0), closed.length);
  const reps = representativePerformance(data, base.representatives);
  assert.equal(reps.reduce((sum, r) => sum + r.won, 0), s.wonCount); assert.equal(reps.filter(r => r.open + r.won + r.lost === 0).length, dataProfile.steps.find(st => st.title === 'Fırsatı olmayan temsilciler').rows);
  close(productPerformance(data, base.products).reduce((sum, p) => sum + p.revenue, 0), s.wonRevenue);
  const companies = companyMetrics(data);
  assert.equal([...companies.values()].reduce((sum, c) => sum + c.records.length, 0), data.filter(op => op.companyId).length);
});

test('kalite: kurallar beklenen kayıtları işaretler', () => {
  const quality = overallQuality(base.opportunities);
  assert.equal(quality.byCode.company, clean.pipeline.filter(r => !r.account).length);
  assert.equal(quality.byCode.stalled, dataProfile.metrics.stalled);
  assert.equal(quality.byCode.owner, 0);
  assert.equal(quality.byCode.amount, stepRows('Kazanılan fırsatta tutar yok'));
  assert.equal(quality.byCode['engage-date'], stepRows('Görüşme tarihi kapanıştan sonra'));
  const engaging = find(base, op => op.stage === 'Engaging' && op.companyId);
  const age = daysBetween(engaging.createdAt, asOfDate);
  assert.equal(scoreOpportunity(engaging).issues.some(i => i.code === 'stalled'), age > stallDays);
  const broken = { ...engaging, companyId: null, ownerId: null, createdAt: null };
  assert.equal(scoreOpportunity(broken).score, 100 - 30 - 30 - 15); assert.equal(scoreOpportunity(broken).severity, 'critical');
});

test('aşama: kazanma, kaybetme ve yeniden açma tutarlı tutar/tarih/olasılık üretir', () => {
  const op = find(base, o => o.stage === 'Engaging');
  const listPrice = base.products.find(p => p.id === op.productId).price;
  let state = applyAction(base, { type: 'move-opportunity', id: op.id, stage: 'Won' });
  let moved = find(state, o => o.id === op.id);
  assert.equal(moved.closedAt, asOfDate); assert.equal(moved.value, listPrice); assert.equal(moved.probability, 100);
  assert.equal(summarize(views(state)).wonCount, summarize(views(base)).wonCount + 1);
  state = applyAction(state, { type: 'move-opportunity', id: op.id, stage: 'Lost' });
  moved = find(state, o => o.id === op.id);
  assert.equal(moved.value, 0); assert.equal(moved.probability, 0); assert.equal(moved.closedAt, asOfDate);
  state = applyAction(state, { type: 'move-opportunity', id: op.id, stage: 'Engaging' });
  moved = find(state, o => o.id === op.id);
  assert.equal(moved.closedAt, null); assert.equal(moved.value, null); assert.equal(moved.probability, base.opportunities.find(o => o.id === op.id).probability);
  const prospect = find(base, o => o.stage === 'Prospecting');
  const engaged = find(applyAction(base, { type: 'move-opportunity', id: prospect.id, stage: 'Engaging' }), o => o.id === prospect.id);
  assert.equal(engaged.createdAt, asOfDate);
});

test('doğrulama: geçersiz fırsat ve şirket girdileri reddedilir', () => {
  const op = base.opportunities[0]; const input = { ...op };
  for (const invalid of [{ value: NaN }, { value: -1 }, { value: 1e12 }, { probability: 101 }, { companyId: 'yok' }, { productId: 'yok' }, { ownerId: 'yok' }, { createdAt: '2027-01-01' }, { createdAt: '2017-02-30' }, { stage: 'Closed' }])
    assert.throws(() => applyAction(base, { type: 'save-opportunity', id: op.id, input: { ...input, ...invalid } }));
  const company = base.companies[0];
  assert.throws(() => applyAction(base, { type: 'save-company', id: 'yeni', input: { ...company, name: company.name.toUpperCase() } }), /zaten var/);
  assert.throws(() => applyAction(base, { type: 'save-company', id: 'yeni', input: { ...company, name: ` ${company.name}. ` } }), /zaten var/);
  assert.throws(() => applyAction(base, { type: 'save-company', id: company.id, input: { ...company, parentId: company.id } }));
  assert.throws(() => applyAction(base, { type: 'save-company', id: 'yeni', input: { ...company, name: 'Yeni', employees: 1.5 } }));
  const state = applyAction(base, { type: 'save-company', id: 'yeni', input: { ...company, name: 'Yeni Şirket', parentId: company.id } });
  assert.equal(state.companies.length, base.companies.length + 1);
});

test('düzeltme: şirketi olmayan fırsata şirket atanınca kritik sorun kalkar', () => {
  const op = find(base, o => !o.companyId);
  const state = applyAction(base, { type: 'save-opportunity', id: op.id, input: { ...op, companyId: base.companies[0].id } });
  assert.equal(overallQuality(state.opportunities).byCode.company, overallQuality(base.opportunities).byCode.company - 1);
  assert.ok(!scoreOpportunity(find(state, o => o.id === op.id)).issues.some(i => i.code === 'company'));
});

test('saklama: yalnızca değişen kayıtlar yazılır, yenilemede korunur, sıfırlama temizler', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const op = find(base, o => o.stage === 'Engaging');
  const first = createDemoStore(() => storage);
  first.dispatch({ type: 'move-opportunity', id: op.id, stage: 'Won' });
  first.dispatch({ type: 'preferences', input: { dateFormat: 'iso' } });
  const stored = JSON.parse(values.get(storageKey));
  assert.equal(stored.opportunities.length, 1); assert.equal(stored.companies.length, 0);
  assert.ok(values.get(storageKey).length < 2000, 'saklanan veri küçük olmalı');
  const second = createDemoStore(() => storage);
  assert.equal(find(second.getSnapshot().state, o => o.id === op.id).stage, 'Won');
  assert.equal(second.getSnapshot().state.preferences.dateFormat, 'iso'); assert.equal(second.getSnapshot().warning, null);
  second.dispatch({ type: 'reset' });
  assert.equal(values.has(storageKey), false);
  assert.equal(find(createDemoStore(() => storage).getSnapshot().state, o => o.id === op.id).stage, 'Engaging');
});

test('saklama: bozuk veya tutarsız kayıt uygulamayı çökertmez', () => {
  const op = base.opportunities[0];
  const stored = changes => JSON.stringify({ schemaVersion: 2, dataVersion, companies: [], preferences: base.preferences, ...changes });
  const bad = [ '{', JSON.stringify({ schemaVersion: 1 }), stored({ opportunities: [{ ...op, productId: 'yok' }] }),
    stored({ opportunities: [{ ...op, stage: 'Won', closedAt: null }] }),
    // Verinin eski bir sürümünden kalan, kendi içinde geçerli görünen değişiklik de uygulanmamalı.
    stored({ dataVersion: 'eski-surum', opportunities: [{ ...op, companyId: null }] }) ];
  for (const raw of bad) {
    const store = createDemoStore(() => ({ getItem: () => raw, setItem() {}, removeItem() {} }));
    assert.ok(store.getSnapshot().warning); assert.equal(store.getSnapshot().state.opportunities.length, base.opportunities.length);
  }
  const failing = createDemoStore(() => ({ getItem: () => null, setItem() { throw Error('Quota'); }, removeItem() {} }));
  failing.dispatch({ type: 'move-opportunity', id: find(base, o => o.stage === 'Engaging').id, stage: 'Lost' });
  assert.ok(failing.getSnapshot().warning);
});

test('tarih ve CSV: UTC güvenli tarih, artık yıl ve kaçışlı CSV', () => {
  assert.ok(validDate('2016-02-29')); assert.ok(!validDate('2017-02-29')); assert.ok(!validDate('2017-04-31'));
  assert.equal(daysBetween('2017-12-30', '2017-12-31'), 1); assert.equal(formatDate('2017-12-31', 'tr'), '31.12.2017');
  const csv = buildCsv(views(base).slice(0, 2));
  assert.ok(csv.startsWith('﻿"Fırsat No"')); assert.equal(csv.split('\r\n').length, 3);
});
