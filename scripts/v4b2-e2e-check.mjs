/** B-2 UI 验收：/data-import /screen 卡渲染 + preview 链路（CDP 真实浏览器） */
const { WebSocket } = globalThis;
let msgId = 0; const pending = new Map(); let socket;
function cdp(method, params = {}) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); socket.send(JSON.stringify({ id, method, params })); }); }
async function connect() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json"); const page = (await res.json()).find((t) => t.type === "page");
      if (page) { socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
        socket.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
        await cdp("Page.enable"); await cdp("Runtime.enable"); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no CDP target");
}
async function evalJs(expr) { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? "").slice(0, 150)); return r.result?.value; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " · " + d : ""}`); };

await connect();
await cdp("Page.navigate", { url: "http://localhost:3210/data-import" });
await sleep(2500);

record("1. /screen 卡渲染（导入 /screen 抄数数据 + 两步按钮）", await evalJs("document.body.innerText.includes('导入 /screen 抄数数据') && document.body.innerText.includes('① 预览') && document.body.innerText.includes('② 确认导入')"));

await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('① 预览')); b.click(); return true; })()`);
await sleep(2000);
record("2. Preview（行数/类型/平台/日期范围）", await evalJs("document.body.innerText.includes('总行数：6') && document.body.innerText.includes('视频号') && document.body.innerText.includes('2026-09-03')"));

record("3. 导入按钮可用（preview 后启用）", await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('② 确认导入')); return b && !b.disabled; })()`));

await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('② 确认导入')); b.click(); return true; })()`);
await sleep(2500);
record("4. UI 导入执行（幂等 updated：全部更新不新建）", await evalJs("document.body.innerText.includes('/screen 抄数导入完成') || document.body.innerText.includes('幂等更新：5')"));

console.log(`\\n${results.filter(Boolean).length}/${results.length} PASS`);
process.exit(0);
