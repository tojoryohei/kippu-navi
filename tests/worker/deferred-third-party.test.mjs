import assert from 'node:assert/strict';
import test from 'node:test';
import { deferThirdParty, scheduleAds } from '../../src/lib/deferred-third-party.ts';
import { initializeGoogleAnalytics, trackGooglePageView } from '../../src/lib/google-analytics.ts';

function browser({ paint = false, now = 0, buffered } = {}) {
  let id = 0;
  const frames = [], timers = new Map(), idle = new Map(), listeners = new Map(), scripts = [];
  const observers = new Set();
  class PaintObserver {
    static supportedEntryTypes = ['paint'];
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  const win = {
    location: { href: 'https://kippu-navi.com/' },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestIdleCallback: callback => { idle.set(++id, callback); return id; },
    cancelIdleCallback: id => idle.delete(id),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
    ...(paint ? { PerformanceObserver: PaintObserver, performance: { now: () => now, getEntriesByName: () => buffered === undefined ? [] : [{ name: 'first-contentful-paint', startTime: buffered }] } } : {}),
  };
  const doc = {
    title: 'トップ', readyState: 'loading',
    head: { append: script => scripts.push(script) },
    createElement: () => ({ dataset: {} }),
    querySelector: () => null,
  };
  return {
    win, doc, scripts, timers,
    paint(time) { now = time; for (const observer of [...observers]) observer.callback({ getEntries: () => [{ name: 'first-contentful-paint', startTime: time }] }); },
    frame() { const pending = frames.splice(0); pending.forEach(callback => callback()); },
    load() { doc.readyState = 'complete'; listeners.get('load')?.(); },
    idle() { const pending = [...idle.values()]; idle.clear(); pending.forEach(callback => callback()); },
    timer(delay) { for (const [key, timer] of [...timers]) if (timer.delay === delay) { timers.delete(key); timer.callback(); } },
  };
}

test('FCPが遅れても描画機会だけで開始せず、FCPから1秒とloadの後に起動する', () => {
  const b = browser({ paint: true }); let calls = 0;
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle(); b.timer(5000);
  assert.equal(calls, 0);
  b.paint(8000); b.idle(); assert.equal(calls, 0);
  b.timer(1000); assert.equal(calls, 0);
  b.idle(); assert.equal(calls, 1);
  b.paint(9000); b.timer(5000); assert.equal(calls, 1);
  assert.equal(b.timers.size, 0);
});

test('既存のFCP時刻を使い、経過済みの時間を待機時間から差し引く', () => {
  const b = browser({ paint: true, now: 1400, buffered: 1000 }); let calls = 0;
  b.doc.readyState = 'complete';
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); b.timer(600); b.idle();
  assert.equal(calls, 1);
});

test('FCPから5秒でloadとアイドルを待たず起動し、後続処理も重複しない', () => {
  const b = browser({ paint: true }); let calls = 0;
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); b.paint(2000); b.timer(1000); b.idle();
  assert.equal(calls, 0);
  b.timer(5000); b.load(); b.idle(); assert.equal(calls, 1);
});

test('Paint Timingの監視に失敗した場合は従来の描画待機へ戻る', () => {
  const b = browser({ paint: true }); let calls = 0;
  b.win.PerformanceObserver = class { static supportedEntryTypes = ['paint']; constructor() { throw new Error('監視不可'); } };
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle(); assert.equal(calls, 1);
});

test('FCPの履歴取得に失敗した場合も監視を解除して描画待機へ戻る', () => {
  const b = browser({ paint: true }); let calls = 0;
  b.win.performance.getEntriesByName = () => { throw new Error('履歴取得不可'); };
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle(); assert.equal(calls, 1);
});

test('描画機会2回とloadの後にアイドルで一度だけ起動する', () => {
  const b = browser(); let calls = 0;
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.idle(); assert.equal(calls, 0);
  b.frame(); b.idle(); assert.equal(calls, 0);
  b.load(); assert.equal(calls, 0);
  b.idle(); b.timer(5000); assert.equal(calls, 1);
  assert.equal(b.timers.size, 0);
});

test('loadが遅い場合も最初の描画機会から5秒で起動し、後続loadで重複しない', () => {
  const b = browser(); let calls = 0;
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.timer(5000); assert.equal(calls, 1);
  b.frame(); b.load(); b.idle(); assert.equal(calls, 1);
});

test('load済み・アイドルAPI非対応でもタイマーで起動する', () => {
  const b = browser(); let calls = 0;
  b.doc.readyState = 'complete'; b.win.requestIdleCallback = undefined;
  deferThirdParty(() => calls++, b.win, b.doc);
  b.frame(); b.frame(); assert.equal(calls, 0);
  b.timer(0); b.timer(5000); assert.equal(calls, 1);
});

test('AdSenseを繰り返し予約してもスクリプトは一度だけ追加する', () => {
  const b = browser();
  scheduleAds(b.win, b.doc); scheduleAds(b.win, b.doc);
  assert.equal(b.scripts.length, 0);
  b.frame(); b.frame(); b.load(); b.idle();
  scheduleAds(b.win, b.doc);
  assert.equal(b.scripts.length, 1);
  assert.match(b.scripts[0].src, /adsbygoogle\.js/);
});

test('GAは遅延取得し、遷移前後のURLとタイトルを発生順に一度ずつ送る', () => {
  const b = browser();
  initializeGoogleAnalytics('G-TEST ID', b.win, b.doc);
  trackGooglePageView('G-TEST ID', b.win, b.doc);
  b.win.location.href = 'https://kippu-navi.com/fare/ticket?route=東京'; b.doc.title = '運賃計算';
  trackGooglePageView('G-TEST ID', b.win, b.doc);
  assert.equal(b.scripts.length, 0); assert.equal(b.win.dataLayer, undefined);
  b.frame(); b.frame(); b.load(); b.idle();
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST%20ID');
  assert.equal(b.win.dataLayer.length, 2);
  b.scripts[0].onload(); b.scripts[0].onload();
  const commands = b.win.dataLayer.map(entry => Array.from(entry));
  assert.deepEqual(commands[1], ['config', 'G-TEST ID', { send_page_view: false }]);
  assert.deepEqual(commands.slice(2), [
    ['event', 'page_view', { page_location: 'https://kippu-navi.com/', page_title: 'トップ' }],
    ['event', 'page_view', { page_location: 'https://kippu-navi.com/fare/ticket?route=東京', page_title: '運賃計算' }],
  ]);
  trackGooglePageView('G-TEST ID', b.win, b.doc);
  assert.equal(b.win.dataLayer.length, 5); assert.equal(b.scripts.length, 1);
});

test('GA待機列はSDK取得中も100件を上限とし、古いイベントから破棄する', () => {
  const b = browser();
  initializeGoogleAnalytics('G-TEST', b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle();
  for (let index = 0; index < 105; index++) {
    b.doc.title = String(index); trackGooglePageView('G-TEST', b.win, b.doc);
  }
  b.scripts[0].onload();
  assert.equal(b.win.dataLayer.length, 102);
  assert.equal(b.win.dataLayer[2][2].page_title, '5');
  assert.equal(b.win.dataLayer[101][2].page_title, '104');
});

test('GA取得失敗時は待機列を破棄し、遷移しても再取得を繰り返さない', () => {
  const b = browser();
  trackGooglePageView('G-TEST', b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle(); b.scripts[0].onerror();
  trackGooglePageView('G-TEST', b.win, b.doc); b.scripts[0].onload();
  assert.equal(b.win.dataLayer.length, 2); assert.equal(b.scripts.length, 1);
});

test('測定IDがなければGoogle Analyticsは読み込まない', () => {
  const b = browser();
  initializeGoogleAnalytics('', b.win, b.doc); trackGooglePageView('', b.win, b.doc);
  b.frame(); b.frame(); b.load(); b.idle();
  assert.equal(b.win.dataLayer, undefined); assert.deepEqual(b.scripts, []);
});
