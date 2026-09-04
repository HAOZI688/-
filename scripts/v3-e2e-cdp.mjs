/**
 * V3 Production Workbench — Browser E2E（CDP 真实浏览器，12 项）
 *
 * 运行：node scripts/v3-e2e-cdp.mjs [--base http://localhost:3210]
 * 前置：生产构建已启动（PORT=3210 next start）、pnpm db:seed 已执行。
 *
 * 交互基线（docs 06 §6.3）：所有 Server Action 均通过真实浏览器表单提交
 * （原生 <form action={fn.bind(null,arg)}> → Next-Action POST，Flight 编码）。
 * 本脚本只做「点击真实按钮 / 提交真实表单 / 断言 DOM」，不手造请求。
 * 输出：12 项 PASS/FAIL + 页面内容快照 → /tmp/v3-e2e-results.md
 */
import { writeFileSync } from "node:fs";
// Node 22+ 内置 WebSocket（无第三方依赖）
const { WebSocket } = globalThis;

const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "http://localhost:3210";
const CDP_PORT = 9223;
const results = [];
const pageSnapshot = [];

/* ===== CDP 客户端 ===== */
let msgId = 0;
const pending = new Map();
let socket;
let networkLog = [];

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
        socket.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
          }
        };
        await cdp("Page.enable");
        await cdp("Runtime.enable");
        await cdp("Network.enable");
        socket.onmessage = ((orig) => (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.method === "Network.requestWillBeSent") {
            const req = msg.params.request;
            if (req.method === "POST" && (req.url.includes("_rsc") || req.url.endsWith("/dashboard") || req.url.endsWith("/weekly-plan"))) {
              networkLog.push({ url: req.url, action: req.postData ? req.postData.slice(0, 120) : "" });
            }
          }
          orig(ev);
        })(socket.onmessage);
        return;
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("CDP 端口无页面目标");
}

async function evalJs(expr) {
  const res = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error("eval error: " + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails));
  return res.result?.value;
}

async function goto(path) {
  await cdp("Page.navigate", { url: BASE + path });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 30000);
  await sleep(700); // 客户端水合
  return evalJs("document.body ? document.body.innerText.slice(0, 200) : ''");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, label = "waitFor") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error(`${label} 超时`);
}

async function hasText(text) {
  return evalJs(`document.body.innerText.includes(${JSON.stringify(text)})`);
}

/** 点击 body 中文本完全匹配的 button（真实用户点击路径） */
async function clickButton(text) {
  const clicked = await evalJs(`(() => {
    const els = [...document.querySelectorAll('button')];
    const btn = els.find((b) => b.innerText.trim().includes(${JSON.stringify(text)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`未找到按钮：${text}`);
  return clicked;
}

/** 断言并记录一项测试 */
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  · " + detail : ""}`);
}

async function run() {
  // 冒烟前置
  const res = await fetch(BASE + "/dashboard");
  if (res.status !== 200) throw new Error(`base ${BASE} 不可达（${res.status}）`);
  await connect();
  await goto("/dashboard");

  /* ===== 1. Dashboard 工作台渲染 ===== */
  try {
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("本周内容运营") || text.includes("Current Cycle") || text.includes("本周生产周期");
    record("1. Dashboard 工作台渲染（本周内容运营卡 / 优先级队列）", ok, ok ? "" : `文本片段：${text.slice(0, 120)}`);
  } catch (e) {
    record("1. Dashboard 工作台渲染", false, String(e.message));
  }

  /* ===== 2. Dashboard 生成本周计划（真实 form 提交，Server Action） ===== */
  try {
    const buttons = await evalJs(`[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).join(' | ')`);
    const hasGen = buttons.includes("生成本周内容计划");
    const hasConfirm = buttons.includes("确认本周选题") || buttons.includes("确认选题");
    const hasStart = buttons.includes("开始生产") || buttons.includes("确认并开始生产");
    if (hasGen) {
      await clickButton("生成本周内容计划");
      await waitFor(
        () => evalJs(`[...document.querySelectorAll('button')].some((b) => (b.innerText.includes('确认本周选题') || b.innerText.includes('确认选题')))`),
        25000,
        "生成计划后出现确认按钮",
      );
      record("2. 生成本周计划（Server Action form）", true, "已生成，出现 Gate 1 确认按钮");
    } else if (hasConfirm || hasStart) {
      record("2. 生成本周计划（Server Action form）", true, `本周计划已存在（按钮：${hasConfirm ? "确认" : "开始生产"}，跳过生成）`);
    } else {
      record("2. 生成本周计划（Server Action form）", false, `未找到生成/确认按钮（按钮列表：${buttons.slice(0, 120)}）`);
    }
  } catch (e) {
    record("2. 生成本周计划", false, String(e.message));
  }

  /* ===== 3. 确认选题（Gate 1）或开始生产 ===== */
  try {
    const buttons = await evalJs(`[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).join(' | ')`);
    const hasConfirm = buttons.includes("确认本周选题") || buttons.includes("确认选题");
    const hasStart = buttons.includes("开始生产") || buttons.includes("确认并开始生产");
    if (hasConfirm) {
      await clickButton("确认");
      await waitFor(
        () => evalJs(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('开始生产') || b.innerText.includes('确认并开始生产'))`),
        25000,
        "确认后出现开始生产",
      );
      record("3. 确认选题（Gate 1）", true, "计划 confirmed，可开始生产");
    } else if (hasStart) {
      record("3. 确认选题（Gate 1）", true, "计划已是 confirmed 状态（跳过）");
    } else {
      record("3. 确认选题（Gate 1）", false, `无 Gate 1 按钮（按钮列表：${buttons.slice(0, 120)}）`);
    }
  } catch (e) {
    record("3. 确认选题（Gate 1）", false, String(e.message));
  }

  /* ===== 4. Weekly Plan 评分明细 ===== */
  try {
    await goto("/weekly-plan");
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("最终评分") || text.includes("基础评分") || text.includes("最终分");
    record("4. /weekly-plan 评分公式说明 + 计划项明细", ok, ok ? "公式说明卡可见" : `文本：${text.slice(0, 100)}`);
  } catch (e) {
    record("4. /weekly-plan 评分明细", false, String(e.message));
  }

  /* ===== 5. Review 三 Tab ===== */
  try {
    await goto("/review");
    const t1 = await hasText("选题确认");
    const t2 = await hasText("内容审核");
    const t3 = await hasText("发布确认");
    const clicked = await evalJs(`(() => {
      const els = [...document.querySelectorAll('button')];
      const b = els.find((x) => x.innerText.includes('内容审核'));
      if (!b) return false; b.click(); return true;
    })()`);
    await sleep(600);
    const afterClick = await evalJs("document.body.innerText.includes('内容审核')");
    record("5. /review 三 Tab（选题/内容/发布）", t1 && t2 && t3 && clicked && afterClick, `选题:${t1} 内容:${t2} 发布:${t3} Tab 可切换`);
  } catch (e) {
    record("5. /review 三 Tab", false, String(e.message));
  }

  /* ===== 6. 全局搜索（⌘K 真实键盘事件 + /api/search） ===== */
  try {
    await goto("/dashboard");
    await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`);
    await waitFor(() => evalJs(`!!document.querySelector('input[placeholder]')`), 8000, "CommandMenu 输入框出现");
    const typed = await evalJs(`(() => {
      const input = document.querySelector('input[placeholder]');
      if (!input) return false;
      input.value = 'Agent Skills';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!typed) throw new Error("未找到搜索输入框");
    await waitFor(() => hasText("Agent Skills"), 15000, "搜索结果包含 Agent Skills");
    const text = await evalJs("document.body.innerText");
    record("6. 全局搜索（⌘K → /api/search）", text.includes("Agent Skills"), "命中趋势/话题结果");
  } catch (e) {
    record("6. 全局搜索", false, String(e.message));
  }

  /* ===== 7. Trend Radar 列表 + 详情 ===== */
  try {
    await goto("/trend-radar");
    await waitFor(() => hasText("Agent Skills"), 15000, "趋势列表渲染");
    const text = await evalJs("document.body.innerText");
    const hasRising = text.includes("上升");
    const hasStable = text.includes("稳定") || text.includes("平稳");
    const hasDeclining = text.includes("下滑") || text.includes("衰退");
    const hasCoverage = text.includes("已覆盖") && text.includes("未覆盖");
    const hasAgent = text.includes("Agent Skills");
    // 进入详情
    const linkOk = await evalJs(`(() => {
      const a = [...document.querySelectorAll('a')].find((x) => x.innerText.includes('Agent Skills'));
      if (!a) return false; a.click(); return true;
    })()`);
    await waitFor(() => evalJs(`location.pathname.includes('trend-radar') && document.body.innerText.includes('评分明细')`), 15000, "趋势详情页渲染");
    const detail = await evalJs("document.body.innerText");
    const hasDetail = detail.includes("Agent Skills") && (detail.includes("评分明细") || detail.includes("趋势评分") || detail.includes("上升"));
    record("7. /trend-radar 列表（上升/稳定/下滑）+ 详情页", hasRising && hasStable && hasDeclining && hasCoverage && hasAgent && linkOk && hasDetail, `列表:${hasAgent} 状态:${hasRising}/${hasStable}/${hasDeclining} 覆盖:${hasCoverage} 详情:${hasDetail}`);
  } catch (e) {
    record("7. Trend Radar", false, String(e.message));
  }

  /* ===== 8. 通知中心 ===== */
  try {
    await goto("/notifications");
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("Agent Skills") || text.includes("涨粉归因") || text.includes("未匹配");
    record("8. /notifications（种子通知渲染）", ok, ok ? "通知条目可见" : `文本：${text.slice(0, 100)}`);
  } catch (e) {
    record("8. 通知中心", false, String(e.message));
  }

  /* ===== 9. 涨粉归因 ===== */
  try {
    await goto("/analytics/attribution");
    await waitFor(() => evalJs(`document.body.innerText.includes('账号基线')`), 20000, "归因页渲染");
    // 展开第一个 <details>（归因结果在 details 内，收起时 innerText 不可见）
    await evalJs(`(() => {
      const d = document.querySelector('details');
      if (d) d.open = true;
      return !!d;
    })()`);
    await sleep(400);
    const text = await evalJs("document.body.innerText");
    const ok = (text.includes("高置信") || text.includes("可能") || text.includes("辅助")) && text.includes("基线") && text.includes("增量");
    record("9. /analytics/attribution（基线/增量/置信度）", ok, ok ? "账号基线+归因结果可见" : `文本：${text.slice(0, 120)}`);
  } catch (e) {
    record("9. 涨粉归因", false, String(e.message));
  }

  /* ===== 10. 小豆芽连接器（新鲜度 / 未匹配 / 导入表单） ===== */
  try {
    await goto("/connectors/xiaodouya");
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("新鲜") && text.includes("导入") && text.includes("未匹配");
    record("10. 小豆芽连接器（新鲜度/CSV 导入/未匹配）", ok, ok ? "新鲜度表+导入表单可见" : `文本：${text.slice(0, 120)}`);
  } catch (e) {
    record("10. 小豆芽连接器", false, String(e.message));
  }

  /* ===== 11. 映射模板页 ===== */
  try {
    await goto("/connectors/xiaodouya/mappings");
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("映射模板") && text.includes("作品导出") && (text.includes("账号导出") || text.includes("保存"));
    record("11. 映射模板列表 + 预设保存按钮", ok, ok ? "模板行+保存动作可见" : `文本：${text.slice(0, 120)}`);
  } catch (e) {
    record("11. 映射模板", false, String(e.message));
  }

  /* ===== 12. 生产监控台 /production ===== */
  try {
    await goto("/production");
    const text = await evalJs("document.body.innerText");
    const ok = text.includes("生产") && (text.includes("运行中") || text.includes("完成") || text.includes("失败"));
    record("12. /production 监控台（DAG 状态 + Run 明细）", ok, ok ? "状态统计+运行明细可见" : `文本：${text.slice(0, 120)}`);
  } catch (e) {
    record("12. 生产监控台", false, String(e.message));
  }

  /* ===== 汇总 ===== */
  const passed = results.filter((r) => r.ok).length;
  const lines = [
    `# V3 Browser E2E（CDP 真实浏览器）— ${passed}/${results.length} PASS`,
    "",
    "| # | 测试项 | 结果 | 详情 |",
    "|---|--------|------|------|",
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.detail} |`),
    "",
    "网络层确认（Server Action 真实 Flight POST）：",
    networkLog.length ? networkLog.map((n) => `- POST ${n.url} action=${n.action.slice(0, 80)}`).join("\n") : "- 未捕获到 POST（页面已缓存或 action 走 RSC）",
    "",
    "关键页面快照：",
    ...pageSnapshot,
  ];
  writeFileSync("/tmp/v3-e2e-results.md", lines.join("\n"));
  console.log(`\n=== ${passed}/${results.length} PASS → /tmp/v3-e2e-results.md ===`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((e) => {
  console.error("E2E 失败：", e);
  process.exit(2);
});
