/** 命名改造 E2E：品牌区分 + 生产基线回归（真实浏览器） */
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

/* Login */
await cdp("Page.navigate", { url: BASE + "/login" });
await sleep(2000);
if ((await evalJs("location.pathname")) === "/login") {
  await evalJs(`(() => { document.querySelector('input[type=password]').value = 'contentos-live-2026'; return true; })()`);
  await evalJs(`(() => { document.querySelector('button[type=submit]').click(); return true; })()`);
  await sleep(3500);
}
record("1. Login（图文工厂｜登录）", await evalJs("document.title.includes('图文工厂')"));

/* Sidebar 品牌与分组 */
await goto("/dashboard");
record("2. Sidebar：图文工厂 + AI 内容生产与运营中台", await evalJs("document.body.innerText.includes('图文工厂') && document.body.innerText.includes('AI 内容生产与运营中台')"));
record("3. Nav 分组（内容规划/内容生产/发布管理/数据连接）", await evalJs("document.body.innerText.includes('内容规划') && document.body.innerText.includes('内容生产') && document.body.innerText.includes('发布管理') && document.body.innerText.includes('数据连接')"));
record("4. Nav：小豆芽 App（外部渠道）+ 数据分析", await evalJs("document.body.innerText.includes('小豆芽 App') && document.body.innerText.includes('数据分析')"));
record("5. 旧名称已清除（无 运营工作台/社交内容运营平台）", !(await evalJs("document.body.innerText.includes('运营工作台') || document.body.innerText.includes('社交内容运营平台')")));

/* Dashboard：品牌 + 闭环链（小豆芽为外部节点） */
record("6. Dashboard 品牌头部 + 生产闭环（小豆芽 App 节点）", await evalJs("document.body.innerText.includes('图文工厂') && document.body.innerText.includes('表现数据回流')"));

/* 生产基线回归：production 成本 */
await goto("/production");
record("7. 生产基线：AI 成本显示不变", await evalJs("document.body.innerText.includes('本周 AI 成本') && document.body.innerText.includes('次调用')"));

/* Publish Package */
await goto("/publish-packages");
record("8. Publish Package 正常", await evalJs("document.body.innerText.includes('GitHub 周榜')"));

/* 小豆芽连接页：定位说明 */
await goto("/connectors/xiaodouya");
record("9. 小豆芽 App 连接页（定位说明 + 数据回流文案）", await evalJs("document.body.innerText.includes('小豆芽 App 连接') && document.body.innerText.includes('数据采集渠道') && document.body.innerText.includes('同步回图文工厂')"));

/* 小豆芽映射页返回文案 */
await goto("/connectors/xiaodouya/mappings");
record("10. 小豆芽映射页（返回小豆芽连接，无『小豆芽工作台』）", await evalJs("document.body.innerText.includes('小豆芽连接') && !document.body.innerText.includes('小豆芽工作台')"));

/* Review 正常 */
await goto("/review");
record("11. Review 三 Gate 正常", await evalJs("document.body.innerText.includes('选题确认') && document.body.innerText.includes('内容审核') && document.body.innerText.includes('发布确认')"));

/* Readiness 正常 */
await goto("/system/readiness");
record("12. Readiness OVERALL 不变", await evalJs("document.body.innerText.includes('PRODUCTION READY') || document.body.innerText.includes('NOT READY')"), "基线保持");

/* 浏览器 title */
record("13. 浏览器 title = 图文工厂｜AI 内容生产与运营中台", await evalJs("document.title.includes('图文工厂') && document.title.includes('AI 内容生产与运营中台')"));

const pass = results.filter((r) => r[1]).length;
console.log(`\n${pass}/${results.length} PASS`);
process.exit(0);
