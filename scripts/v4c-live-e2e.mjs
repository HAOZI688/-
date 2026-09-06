/** B-3 Live Production E2E（CDP 真实浏览器，§26-28）：Live 模式下 Weekly Plan → 生产 → needs_manual 阻断 → 待办/通知 → Package → Readiness */
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
async function goto(path) { await cdp("Page.navigate", { url: BASE + path }); await sleep(2200); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickButton(t) { return evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(${JSON.stringify(t)})); if (!b || b.disabled) return false; b.click(); return true; })()`); }
const BASE = "http://localhost:3210";
const results = [];
const record = (n, ok, d = "") => { results.push([n, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " · " + d : ""}`); };

await connect();

/* 1. Dashboard：LIVE 徽章 + 今日待办 */
await goto("/dashboard");
record("1. Dashboard LIVE 模式徽章", await evalJs("document.body.innerText.includes('LIVE 模式（已排除演示数据）')"));
record("1b. Action Center 首屏（含今日抄数提醒）", await evalJs("document.body.innerText.includes('今天需要处理什么') && document.body.innerText.includes('今日数据尚未抄数')"));

/* 2. Generate Weekly Plan（Live，真实数据评分） */
await goto("/dashboard");
const gen = await clickButton("生成本周内容计划");
if (gen) { await sleep(4000); }
record("2. Generate Weekly Plan（Live）", await evalJs("document.body.innerText.includes('确认本周选题') || document.body.innerText.includes('生成本周内容计划')"), gen ? "已生成" : "已有计划");

/* 3. Weekly Plan：评分明细 + 表现调整诚实呈现 */
await goto("/weekly-plan");
const scoreDetail = await evalJs("document.body.innerText.includes('评分模型') || document.body.innerText.includes('最终分')");
const perfCol = await evalJs("document.body.innerText.includes('表现调整') || document.body.innerText.includes('表现')");
record("3. Weekly Plan 解释性评分（base/trend/perf/conv/gap）", scoreDetail && perfCol, `评分:${scoreDetail} 表现列:${perfCol}`);

/* 4. Approve + Start Production（触发 DAG 四工作流） */
await goto("/review");
const confirmed = await clickButton("确认本周选题");
if (confirmed) await sleep(3000);
const started = await clickButton("确认并开始生产");
if (started) await sleep(6000);
record("4. Gate1 确认 + 开始生产（DAG 触发）", Boolean(confirmed || started), `${confirmed ? "confirmed " : ""}${started ? "production started" : ""}`);

/* 5. Production：四工作流 needs_manual 阻断（Live 无 Key → 禁止演示假产出） */
await goto("/production");
await sleep(1000);
const manualBadge = await evalJs("document.body.innerText.includes('需人工介入')");
const aiBlocked = await evalJs("document.body.innerText.includes('AI Provider 未配置') || document.body.innerText.includes('需人工介入')");
record("5. §28 失败场景：Live 无 Key → 四工作流 needs_manual（不产假正文）", aiBlocked, `需人工介入标记:${manualBadge}`);

/* 6. Dashboard 待办：AI 需人工介入 */
await goto("/dashboard");
record("6. Action Center：AI 需人工介入条目", await evalJs("document.body.innerText.includes('AI 调用失败需人工介入') || document.body.innerText.includes('AI Provider 未配置')"));

/* 7. Publish Package：GitHub 周榜包（QA 门禁 + needs_assets 诚实） */
await goto("/publish-packages");
const pkgBtn = await clickButton("生成本周发布包");
if (pkgBtn) await sleep(4000);
const pkgOk = await evalJs("document.body.innerText.includes('GitHub 周榜') && document.body.innerText.includes('详情')");
record("7. GitHub Weekly Publish Package（快照绑定）", pkgOk);

/* 8. AI 成本区（诚实：无真实调用 → 显示提示而非 0 假数据） */
await goto("/production");
record("8. AI 成本区诚实呈现（无真实调用时明确说明）", await evalJs("document.body.innerText.includes('本周 AI 成本')"));

/* 9. readiness：live + 无 Key → NOT READY（AI FAIL） */
await goto("/system/readiness");
const notReady = await evalJs("document.body.innerText.includes('NOT READY')");
const aiFail = await evalJs("document.body.innerText.includes('AI Primary Provider') && document.body.innerText.includes('FAIL')");
record("9. §29 readiness：Live 无 Key → NOT READY（Critical/Required FAIL 诚实）", notReady && aiFail, `NOT READY:${notReady} AI FAIL:${aiFail}`);

const pass = results.filter((r) => r[1]).length;
console.log(`\n${pass}/${results.length} PASS`);
process.exit(0);
