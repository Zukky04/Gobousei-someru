// 使い方: node e2e.mjs <index.htmlの絶対パス> <出力フォルダ>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const [, , htmlPath, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, "--no-first-run",
  "--no-default-browser-check", `--user-data-dir=${outDir}/.profile`, "about:blank",
], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
}
const page = targets.find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;

let mobile = true;
async function setup(isMobile) {
  mobile = isMobile;
  if (isMobile) {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  } else {
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
  await send("Page.navigate", { url: "file://" + htmlPath });
  await sleep(700);
}
async function tapAt(x, y) {
  if (mobile) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  await sleep(150);
}
// 星の場所: 0..4 = とがり, 5 = まんなか。重心を画面座標に変換してタップ
async function tapPart(i) {
  const [x, y] = await evaluate(`(() => {
    const p = document.querySelectorAll('#star polygon')[${i}];
    const pts = [...p.points]; const n = pts.length;
    const sp = document.getElementById('star').createSVGPoint();
    sp.x = pts.reduce((a, q) => a + q.x, 0) / n; sp.y = pts.reduce((a, q) => a + q.y, 0) / n;
    const s = sp.matrixTransform(p.getScreenCTM()); return [s.x, s.y];
  })()`);
  await tapAt(x, y);
}
async function tapSel(sel) {
  const [x, y] = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await tapAt(x, y);
}
const tapColor = name => tapSel(`.swatch[aria-label="${name}"]`);
const fills = () => evaluate(`[...document.querySelectorAll('#star polygon')].map(p => getComputedStyle(p).fill)`);
const held = () => evaluate(`document.getElementById('name').textContent`);
async function shot(file) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${outDir}/${file}`, Buffer.from(data, "base64"));
}
const W = "rgb(255, 255, 255)";
const results = [];
function check(test, label, ok, detail = "") {
  results.push({ test, label, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} [${test}] ${label}${detail ? " — " + detail : ""}`);
}

await send("Page.enable"); await send("Runtime.enable");

// 1: 最初の状態 + 色なしで星を押す
await setup(true);
let f = await fills();
check(1, "最初は6か所とも白", f.length === 6 && f.every(c => c === W), JSON.stringify(f));
check(1, "最初は色を持っていない", (await held()) === "");
await tapPart(0);
check(1, "色なしで押しても塗られない", (await fills())[0] === W);
check(1, "指がゆれる", await evaluate(`document.getElementById('holder').classList.contains('nudge')`));
await shot("test1-mobile-initial.png");

// 2: あかを拾って2か所塗る（拾った色はそのまま）
await setup(true);
await tapColor("あか");
check(2, "指があかを持つ", (await held()) === "あか");
await tapPart(0); await tapPart(5);
f = await fills();
check(2, "うえ と まんなか があかになる", f[0] === "rgb(230, 0, 51)" && f[5] === "rgb(230, 0, 51)", JSON.stringify(f));
check(2, "他は白のまま", [1, 2, 3, 4].every(i => f[i] === W));
check(2, "色を塗っても持ったまま", (await held()) === "あか");
await shot("test2-mobile-red.png");

// 3: 色を持ちかえて6か所すべて違う色に、上から塗りかえも
await setup(true);
const plan = [["きいろ", 0], ["だいだいいろ", 1], ["あか", 2], ["むらさき", 3], ["あお", 4], ["みどり", 5], ["ももいろ", 0]];
for (const [c, p] of plan) { await tapColor(c); await tapPart(p); }
f = await fills();
check(3, "6か所すべて色がつく", f.every(c => c !== W), JSON.stringify(f));
check(3, "塗った場所を別の色で上塗りできる", f[0] === "rgb(244, 163, 188)");
check(3, "最後に選んだ色を持っている", (await held()) === "ももいろ");
check(3, "選んだボタンだけ枠がつく", await evaluate(`[...document.querySelectorAll('.swatch[aria-pressed="true"]')].map(b => b.getAttribute('aria-label')).join() === 'ももいろ'`));
await shot("test3-mobile-allcolors.png");

// 4: クリア → やめる → クリア → しろにもどす
await tapSel("#clear");
check(4, "クリアで確認が出る", await evaluate(`document.getElementById('confirm').open`));
await shot("test4a-mobile-confirm.png");
await tapSel('#confirm button[value="cancel"]');
f = await fills();
check(4, "やめる なら色は残る", f.every(c => c !== W) && !(await evaluate(`document.getElementById('confirm').open`)));
await tapSel("#clear");
await tapSel('#confirm button[value="ok"]');
f = await fills();
check(4, "しろにもどす で6か所とも白", f.every(c => c === W), JSON.stringify(f));
check(4, "持っている色はそのまま", (await held()) === "ももいろ");
await shot("test4b-mobile-cleared.png");

// 5: パソコン（マウス）で遊ぶ
await setup(false);
const plan5 = [["そらいろ", 5], ["あいいろ", 0], ["あいいろ", 2], ["きみどり", 1], ["きみどり", 4], ["やまぶきいろ", 3]];
for (const [c, p] of plan5) { await tapColor(c); await tapPart(p); }
f = await fills();
check(5, "マウスでも6か所塗れる", f.every(c => c !== W), JSON.stringify(f));
check(5, "横に広がらず中央に縦長", await evaluate(`(() => { const r = document.querySelector('main').getBoundingClientRect(); return r.width <= 440 && Math.abs(r.x + r.width / 2 - innerWidth / 2) < 2; })()`));
check(5, "画面に収まる（縦スクロールなし）", await evaluate(`document.documentElement.scrollHeight <= innerHeight`));
await shot("test5-pc.png");

writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
ws.close(); chrome.kill();
process.exit(failed ? 1 : 0);
