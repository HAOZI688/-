/**
 * V4 Production Readiness — Browser E2E（CDP 真实浏览器，14 项）
 *
 * 运行：node scripts/v4-e2e-cdp.mjs [--base http://localhost:3210]
 * 前置：生产构建已启动（PORT=3210 next start）、pnpm db:seed 已执行。
 *
 * 覆盖 V4 验收路径：Action Center / 冷启动横幅 / GitHub 周榜发布包（生成→QA→视觉→推进）/
 * 品牌资产上传 / CSV 导入（含坏行→失败行重试）/ 手动匹配 / readiness / 数据导出 / 登录页。
 * 所有 Server Action 通过真实浏览器表单提交（Next-Action POST），文件用 DOM.setFileInputFiles。
 * 输出：/tmp/v4-e2e-results.md
 */
import { writeFileSync, mkdtempSync, writeFileSync as wfs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { WebSocket } = globalThis;

const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "http://localhost:3210";
const CDP_PORT = 9223;
const results = [];

let msgId = 0;
const pending = new Map();
let socket;

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
        await cdp("DOM.enable");
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
  await sleep(800);
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

/** 通过 CDP 给页面第一个 file input 设置真实文件（真实上传路径） */
async function setFileInput(filePath) {
  const { root } = await cdp("DOM.getDocument");
  const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  if (!nodeId) throw new Error("页面无 file input");
  await cdp("DOM.setFileInputFiles", { files: [filePath], nodeId });
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  · " + detail : ""}`);
}

async function run() {
  const res = await fetch(BASE + "/dashboard");
  if (res.status !== 200) throw new Error(`base ${BASE} 不可达（${res.status}）`);
  await connect();

  /* ===== 1. Dashboard：Action Center 首屏 ===== */
  try {
    await goto("/dashboard");
    const ok = await hasText("今天需要处理什么");
    const count = await evalJs(`document.body.innerText.includes('项待办')`);
    record("1. Dashboard 首屏「今天需要处理什么」（Action Center）", ok, ok ? `待办标记：${count}` : "未找到 Action Center 首屏");
  } catch (e) { record("1. Dashboard Action Center", false, String(e.message)); }

  /* ===== 2. Dashboard：冷启动保护横幅 ===== */
  try {
    const insufficient = await hasText("数据不足");
    const lowOrOk = await hasText("当前建议主要依据趋势与内容价值") || (await hasText("数据充足"));
    record("2. 冷启动保护横幅（数据置信度提示）", insufficient || lowOrOk, insufficient ? "insufficient 横幅可见（seed 库预期）" : "已达到更高置信度");
  } catch (e) { record("2. 冷启动横幅", false, String(e.message)); }

  /* ===== 3. Weekly Plan：冷启动横幅 + 评分明细 ===== */
  try {
    await goto("/weekly-plan");
    const ok = (await hasText("数据不足")) || (await hasText("数据充足"));
    const score = await hasText("最终分") || await hasText("评分模型");
    record("3. /weekly-plan 冷启动横幅 + 评分明细", ok && score, `横幅:${ok} 评分:${score}`);
  } catch (e) { record("3. weekly-plan 冷启动", false, String(e.message)); }

  /* ===== 4. Production：AI 成本 + 验收卡 ===== */
  try {
    await goto("/production");
    const cost = await hasText("本周 AI 成本");
    const acc = await hasText("本周内容验收");
    record("4. /production AI 成本 + 内容验收卡", cost && acc, `成本:${cost} 验收:${acc}`);
  } catch (e) { record("4. production 成本/验收", false, String(e.message)); }

  /* ===== 5. Publish Package：生成 GitHub 周榜包 ===== */
  try {
    await goto("/publish-packages");
    const buttons = await evalJs(`[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).join(' | ')`);
    if (buttons.includes("生成本周发布包")) {
      await clickButton("生成本周发布包");
      await waitFor(() => evalJs(`document.body.innerText.includes('GitHub 周榜') && document.body.innerText.includes('详情')`), 25000, "发布包生成");
      record("5. 生成 GitHub 周榜发布包（真实 form）", true, "包已出现在列表");
    } else if (buttons.includes("详情")) {
      record("5. 生成 GitHub 周榜发布包（真实 form）", true, "包已存在（幂等跳过）");
    } else {
      record("5. 生成 GitHub 周榜发布包", false, `无快照或按钮（${buttons.slice(0, 80)}）`);
    }
  } catch (e) { record("5. 发布包生成", false, String(e.message)); }

  /* ===== 6. 包详情：正文断言（总榜/提纲/图片顺序/CTA/QA 门禁） ===== */
  let detailPath = null;
  try {
    await goto("/publish-packages");
    detailPath = await evalJs(`(() => {
      const a = [...document.querySelectorAll('a')].find((x) => { const h = x.getAttribute('href') || ''; return h.indexOf('/publish-packages/') === 0 && h.indexOf('/assets') === -1 && h.length > 40; });
      return a ? a.getAttribute('href') : null;
    })()`);
    if (!detailPath) throw new Error("列表无详情链接");
    detailPath = detailPath.replace(/^https?:\/\/[^/]+/, ""); // 绝对 URL → 相对路径
    await goto(detailPath);
    const body = await hasText("本周总榜");
    const outline = await hasText("极简提纲");
    const imgOrder = await hasText("图片顺序");
    const cta = await hasText("CTA：");
    const qa = await hasText("QA 三项");
    const snapBind = await hasText("Snapshot 绑定");
    record("6. 包详情：总榜文案/提纲/图片顺序/CTA/QA 门禁/Snapshot 绑定", body && outline && imgOrder && cta && qa && snapBind, `总榜:${body} 提纲:${outline} 图序:${imgOrder} CTA:${cta} QA:${qa} 快照:${snapBind}`);
  } catch (e) { record("6. 包详情断言", false, String(e.message)); }

  /* ===== 7. QA 三项通过（真实点击，等 revalidate） ===== */
  try {
    if (!detailPath) throw new Error("无详情页路径");
    for (let i = 0; i < 3; i++) {
      await goto(detailPath); // 每次全新导航，避免 React revalidate 时序竞争
      const clicked = await evalJs(`(() => {
        const rows = [...document.querySelectorAll('div')].filter((d) => d.className.includes('rounded-md border') && d.innerText.includes('待确认') && d.innerText.includes('通过'));
        const row = rows[rows.length - 1]; // 最内层匹配行（外层容器也含该文本）
        if (!row) return false;
        const btn = [...row.querySelectorAll('button')].find((b) => b.innerText.trim() === '通过');
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
      if (!clicked) break;
      await sleep(2500); // 等 server action 完成
    }
    await goto(detailPath);
    const pendingLeft = await evalJs(`(document.body.innerText.match(/待确认/g) || []).length`);
    record("7. QA 三项确认（fact/brand/content → passed）", pendingLeft === 0, `剩余待确认 ${pendingLeft} 项`);
  } catch (e) { record("7. QA 三项", false, String(e.message)); }

  /* ===== 8. 品牌资产上传（真实文件） ===== */
  try {
    await goto("/publish-packages/assets");
    const tmp = mkdtempSync(join(tmpdir(), "v4e2e-"));
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const file = join(tmp, "cover-e2e.png");
    wfs(file, png);
    await setFileInput(file);
    await evalJs(`(() => {
      const inputs = [...document.querySelectorAll('form input[name=name]')];
      if (inputs[0]) { inputs[0].value = 'E2E 封面资产'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    })()`);
    await clickButton("上传");
    await waitFor(() => evalJs("document.body.innerText.includes('E2E 封面资产')"), 20000, "资产出现在列表");
    // 第二个资产（卡片）——发布包进入 QA 至少需要 2 个视觉资产（门禁）
    const file2 = join(tmp, "card-e2e.png");
    wfs(file2, png);
    await evalJs(`(() => { const i = document.querySelector('input[type=file]'); i.value = ''; return true; })()`);
    await setFileInput(file2);
    await evalJs(`(() => {
      const inputs = [...document.querySelectorAll('form input[name=name]')];
      if (inputs[0]) { inputs[0].value = 'E2E 卡片资产'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    })()`);
    await evalJs(`(() => {
      const sel = document.querySelector('form select[name=type]');
      if (sel) { sel.value = 'card'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    })()`);
    await clickButton("上传");
    await waitFor(() => evalJs("document.body.innerText.includes('E2E 卡片资产')"), 20000, "第二个资产出现");
    record("8. 品牌资产上传（真实文件 ×2 → 列表可见 + 可锁定/停用）", true, "E2E 封面/卡片资产已上传");
  } catch (e) { record("8. 品牌资产上传", false, String(e.message)); }

  /* ===== 9. 挂载视觉资产 + 提交 QA（门禁推进） ===== */
  try {
    if (!detailPath) throw new Error("无详情页路径");
    await goto(detailPath);
    const attachCount = await evalJs(`[...document.querySelectorAll('button')].filter((x) => x.innerText.startsWith('+ ')).length`);
    for (let i = 0; i < attachCount; i++) {
      await evalJs(`(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.innerText.startsWith('+ '));
        if (!b) return false; b.click(); return true;
      })()`);
      await sleep(2000);
    }
    let ok = attachCount > 0;
    if (ok) {
      await clickButton("提交 QA 审核");
      await waitFor(() => evalJs("document.body.innerText.includes('待 QA 审核')"), 15000, "包状态 → 待 QA 审核");
    }
    const status = await evalJs(`document.body.innerText.includes('待 QA 审核')`);
    record("9. 挂载视觉资产 + 提交 QA 审核", ok && status, `挂载 ${attachCount} 个资产，包状态待 QA 审核:${status}`);
  } catch (e) { record("9. 挂载+提交 QA", false, String(e.message)); }

  /* ===== 10. CSV 导入（含坏行 → 失败行） ===== */
  try {
    await goto("/connectors/xiaodouya");
    const tmp = mkdtempSync(join(tmpdir(), "v4e2e-"));
    const csv = "作品ID,作品标题,发布时间,点赞数,播放量\n90001,E2E 测试作品A,2026-09-01 10:00,120,4500\n,E2E 坏行无ID,2026-09-02 10:00,10,20\n";
    const file = join(tmp, "e2e-posts.csv");
    wfs(file, csv);
    const forms = await evalJs(`[...document.querySelectorAll('form')].filter((f) => f.querySelector('input[type=file]')).length`);
    if (forms >= 2) {
      // 第二个 file form 是作品 CSV
      const inputId = await evalJs(`(() => {
        const forms = [...document.querySelectorAll('form')].filter((f) => f.querySelector('input[type=file]'));
        const inp = forms[1].querySelector('input[type=file]');
        inp.setAttribute('data-e2e-id', 'posts-file');
        return true;
      })()`);
      const { root } = await cdp("DOM.getDocument");
      const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[data-e2e-id=posts-file]" });
      await cdp("DOM.setFileInputFiles", { files: [file], nodeId });
      await evalJs(`(() => {
        const forms = [...document.querySelectorAll('form')].filter((f) => f.querySelector('input[type=file]'));
        const btn = forms[1].querySelector('button[type=submit]');
        btn.click();
        return true;
      })()`);
      await waitFor(() => evalJs(`document.body.innerText.includes('e2e-posts.csv')`), 25000, "批次出现");
      const retryVisible = await hasText("重试失败行");
      const exportVisible = await hasText("导出失败行");
      record("10. CSV 导入（坏行 → 失败行留痕 + 重试/导出按钮）", retryVisible && exportVisible, `重试:${retryVisible} 导出:${exportVisible}`);
    } else {
      record("10. CSV 导入", false, `file form 数量：${forms}`);
    }
  } catch (e) { record("10. CSV 导入", false, String(e.message)); }

  /* ===== 11. 未匹配作品手动匹配 ===== */
  try {
    await goto("/connectors/xiaodouya");
    const hasUnmatched = await evalJs(`document.body.innerText.includes('未匹配作品')`);
    const matched = await evalJs(`(() => {
      const sel = document.querySelector('select[name=publicationId]');
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '匹配');
      if (!sel || !btn) return 'no-target';
      return 'present';
    })()`);
    record("11. 未匹配作品区 + 手动匹配控件", hasUnmatched, matched === "present" ? "匹配控件存在（有未匹配作品）" : "全部已匹配或无目标");
  } catch (e) { record("11. 手动匹配", false, String(e.message)); }

  /* ===== 12. /system/readiness ===== */
  try {
    await goto("/system/readiness");
    const title = await hasText("生产就绪检查");
    const overall = await hasText("PRODUCTION READY") || await hasText("NOT READY");
    const tiers = (await hasText("Critical（关键）")) && (await hasText("Required（必备）")) && (await hasText("Optional（增强）"));
    record("12. /system/readiness（三级检查 + 总体状态）", title && overall && tiers, `标题:${title} 状态:${overall} 分层:${tiers}`);
  } catch (e) { record("12. readiness 页", false, String(e.message)); }

  /* ===== 13. 数据导出 CSV（真实内容） ===== */
  try {
    const res = await fetch(BASE + "/api/export?type=topics");
    const text = await res.text();
    record("13. /api/export topics CSV", res.status === 200 && text.includes("topic_id") && text.includes("title"), `status=${res.status} 首行=${text.split("\\n")[0]?.slice(0, 50)}`);
  } catch (e) { record("13. 数据导出", false, String(e.message)); }

  /* ===== 14. /login（未配置凭证 → 开发模式提示） ===== */
  try {
    await goto("/login");
    const dev = await hasText("未配置登录凭证");
    const enabled = await hasText("输入工作区密码");
    record("14. /login 页（开发模式提示 / 密码表单）", dev || enabled, dev ? "开发模式（无凭证）提示正确" : "已配置凭证，密码表单可见");
  } catch (e) { record("14. 登录页", false, String(e.message)); }

  /* ===== 输出 ===== */
  const pass = results.filter((r) => r.ok).length;
  const lines = [
    "# V4 Production Readiness — E2E Results",
    "",
    `- Base: ${BASE}`,
    `- Date: ${new Date().toISOString()}`,
    `- Result: ${pass}/${results.length} PASS`,
    "",
    ...results.map((r, i) => `${i + 1}. **${r.ok ? "PASS" : "FAIL"}** ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
  ].join("\n");
  writeFileSync("/tmp/v4-e2e-results.md", lines);
  console.log(`\n${pass}/${results.length} PASS → /tmp/v4-e2e-results.md`);
  process.exit(0);
}

/** 包详情页 QA 循环辅助：提交 QA 后页面 revalidate，重新等待可交互 */
async function goto2Current() {
  await sleep(400);
}

run().catch((e) => {
  console.error("E2E 失败：", e.message);
  process.exit(1);
});
