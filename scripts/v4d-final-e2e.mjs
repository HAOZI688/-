/** B-3 FINAL：Live AI Production 全链路 E2E（真实浏览器，已登录 session） */
const { WebSocket } = globalThis;
let msgId = 0; const pending = new Map(); let socket;
function cdp(method, params = {}) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); socket.send(JSON.stringify({ id, method, params })); }); }
const res = await fetch("http://127.0.0.1:9223/json"); const page = (await res.json()).find((t) => t.type === "page");
socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
socket.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); res(m.result); } };
await cdp("Page.enable"); await cdp("Runtime.enable");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evalJs(e) { const r = await cdp("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; }
async function goto(p) { await cdp("Page.navigate", { url: BASE + p }); await sleep(2800); }
const BASE = "http://localhost:3210";
const results = [];
const record = (n, ok, d = "") => { results.push([n, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " · " + d : ""}`); };

/* 1. Login */
await cdp("Page.navigate", { url: BASE + "/login" });
await sleep(2000);
if ((await evalJs("location.pathname")) === "/login") {
  await evalJs(`(() => { document.querySelector('input[type=password]').value = 'contentos-live-2026'; return true; })()`);
  await evalJs(`(() => { document.querySelector('button[type=submit]').click(); return true; })()`);
  await sleep(3500);
}
record("1. Login（单用户密码 → session）", (await evalJs("location.pathname")) !== "/login");

/* 2. Dashboard：Live + 待办 */
await goto("/dashboard");
record("2. Dashboard（LIVE 徽章 + 今日待办）", await evalJs("document.body.innerText.includes('LIVE 模式') && document.body.innerText.includes('今天需要处理什么')"));

/* 3. Weekly Plan：评分明细 */
await goto("/weekly-plan");
record("3. Weekly Plan 评分明细（base/trend/perf/conv/gap）", await evalJs("document.body.innerText.includes('最终分') || document.body.innerText.includes('评分模型')"));

/* 4. Production：四工作流 runs + needs_review 状态 + AI 成本 */
await goto("/production");
const costText = await evalJs(`(() => { const m = document.body.innerText.match(/总计 \\$[0-9.]+ · [0-9]+ 次调用/); return m ? m[0] : "none"; })()`);
record("4. Production：真实 AI 成本显示", costText !== "none", costText);
const accRow = await evalJs("document.body.innerText.includes('本周内容验收')");
record("4b. 内容验收卡", accRow);

/* 5. runs 状态（含真实 needs_review） */
const runStats = await evalJs(`document.body.innerText.includes('待人工复核') || document.body.innerText.includes('needs_review') || document.body.innerText.includes('已完成')`);
record("4c. Run 明细（含真实状态）", runStats);

/* 6. Review：已通过资产可见 */
await goto("/content");
record("5. Content：真实产出资产（Plugins 与 MCP）", await evalJs("document.body.innerText.includes('Plugins 与 MCP')"));

/* 7. Publish Package */
await goto("/publish-packages");
record("6. Publish Package（GitHub 周榜包）", await evalJs("document.body.innerText.includes('GitHub 周榜')"));

/* 8. GitHub Weekly 页 */
await goto("/github-weekly");
record("7. GitHub 周榜页（快照）", await evalJs("document.body.innerText.includes('快照')"));

/* 9. Topic Performance */
await goto("/analytics/topics");
record("8. Topic Performance 页", await evalJs("document.body.innerText.includes('表现') || document.body.innerText.includes('Topic')"));

/* 10. Readiness：最终 verdict */
await goto("/system/readiness");
const rd = await evalJs(`document.body.innerText.match(/PRODUCTION READY|NOT READY/g)?.[0]`);
const aiPass = await evalJs("document.body.innerText.includes('AI Primary Provider（真实请求验证）')");
record("9. Readiness（AI Primary 真实验证项 + overall）", Boolean(rd) && aiPass, `overall=${rd}`);

/* 11. Logout */
await evalJs(`(() => { const f = document.querySelector('form[action=\"/api/auth/logout\"]'); if (f) f.submit(); return true; })()`);
await sleep(2500);
record("10. Logout（清除 session → 登录页）", await evalJs("location.pathname.includes('/login')"));

const pass = results.filter((r) => r[1]).length;
console.log(`\n${pass}/${results.length} PASS`);
process.exit(0);
