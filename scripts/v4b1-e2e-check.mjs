/** B-1 UI 验收：/data-import 抄数卡渲染 + 真实导入（CDP 浏览器） */
import { writeFileSync, mkdtempSync, writeFileSync as wfs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { WebSocket } = globalThis;
const BASE = "http://localhost:3210";
const results = [];
let msgId = 0; const pending = new Map(); let socket;
function cdp(method, params = {}) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); socket.send(JSON.stringify({ id, method, params })); }); }
async function connect() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json"); const page = (await res.json()).find((t) => t.type === "page");
      if (page) { socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
        socket.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
        await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable"); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no CDP target");
}
async function evalJs(expr) { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? "").slice(0, 200)); return r.result?.value; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, t = 15000, label = "") { const s = Date.now(); while (Date.now() - s < t) { try { const v = await fn(); if (v) return v; } catch {} await sleep(300); } throw new Error(label + " timeout"); }
function record(name, ok, detail = "") { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " · " + detail : ""}`); }

await connect();
await cdp("Page.navigate", { url: BASE + "/data-import" });
await waitFor(() => evalJs("document.readyState === 'complete'"), 20000); await sleep(800);

// 1. 抄数卡渲染
const hasCard = await evalJs("document.body.innerText.includes('导入抄数 CSV') && document.body.innerText.includes('B-1')");
record("1. /data-import 抄数卡渲染（导入抄数 CSV + 日期列说明）", hasCard);

// 2. 真实 UI 导入：选文件 → 点导入 → 结果展示
const tmp = mkdtempSync(join(tmpdir(), "b1-"));
const csv = "日期,平台,账号,粉丝数,新增粉丝,主页访问,曝光,播放,互动\n2026-08-29,视频号,唯元智创,60,2,18,\"1,100\",160,9\n";
const file = join(tmp, "ui-manual.csv");
wfs(file, csv);
const { root } = await cdp("DOM.getDocument");
// 抄数卡的 file input 是页面第一个 file input
const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
await cdp("DOM.setFileInputFiles", { files: [file], nodeId });
await evalJs(`(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find((x) => x.innerText.includes('导入抄数 CSV')); if (b) b.click(); return Boolean(b); })()`);
await waitFor(() => evalJs("document.body.innerText.includes('抄数导入完成') || document.body.innerText.includes('失败')"), 30000, "导入结果");
const okText = await evalJs("document.body.innerText.includes('抄数导入完成')");
const stats = await evalJs(`(() => { const t = document.body.innerText; const m = t.match(/账号快照：\\d+/); return m ? m[0] : "none"; })()`);
const recalc = await evalJs("document.body.innerText.includes('已自动触发')");
record("2. UI 真实导入（选文件→导入→结果统计）", okText && stats !== "none", `${stats} · 自动重算显示:${recalc}`);

// 3. 重复导入（同文件再点一次 → 幂等 updated）：等按钮恢复 enabled 再点
await waitFor(() => evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('导入抄数 CSV')); return b && !b.disabled; })()`), 15000, "按钮恢复");
await sleep(600);
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('导入抄数 CSV')); b.click(); return true; })()`);
// 同内容文件 → 文件级重复检测跳过（快照级幂等已由 CLI 变更内容测试覆盖：4 行同日期 → updated 不新建）
await waitFor(() => evalJs("document.body.innerText.includes('同内容文件已导入过')"), 30000, "重复文件跳过");
record("3. UI 重复导入 → 文件级重复检测跳过（不重复建批次/快照）", true);

// 4. 失败行详情渲染（坏日期文件）
const bad = join(tmp, "bad.csv");
wfs(bad, "日期,平台,账号,粉丝数\n2026-13-99,视频号,唯元智创,61\n");
const { root: root2 } = await cdp("DOM.getDocument");
const { nodeId: nid2 } = await cdp("DOM.querySelector", { nodeId: root2.nodeId, selector: "input[type=file]" });
await cdp("DOM.setFileInputFiles", { files: [bad], nodeId: nid2 });
await evalJs(`(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find((x) => x.innerText.includes('导入抄数 CSV')); if (b) b.click(); return true; })()`);
await waitFor(() => evalJs("document.body.innerText.includes('失败行明细')"), 30000, "失败行");
const errShown = await evalJs("document.body.innerText.includes('失败行明细') && document.body.innerText.includes('无法解析为日期')");
record("4. 失败行明细（行/字段/原值/原因 → UI 可见）", errShown);

writeFileSync("/tmp/v4b1-results.md", results.map((r, i) => `${i + 1}. ${r.ok ? "PASS" : "FAIL"} ${r.name} ${r.detail}`).join("\n"));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS`);
process.exit(0);
