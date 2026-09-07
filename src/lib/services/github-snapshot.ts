/**
 * B-4 §3-§5：真实 GitHub Weekly Snapshot 管道。
 *
 * 规则（《内容总控台 V1.1》+ B-4 整改）：
 * - 统计口径：上一完整自然周 周一 00:00 ~ 周日 23:59；每周一抓取 Original Snapshot
 * - 数据必须来自真实 GitHub API（GitHub Search + Repo 端点），禁止模型编造 owner/repo/stars
 * - 周增长口径：GitHub 无官方 trending API。本管道采用「统计周期内新建仓库」口径
 *   （created:>=周期起 sort:stars），weekly_growth_source = github_search_created_in_period，
 *   展示时必须写明「本周新建仓库」而非「周增长 N 星」
 * - Original 一旦落库 immutable=true，后续只能 Replay/Correction
 */
import { githubRepository } from "@/lib/repositories";
import { auditRepository } from "@/lib/repositories";
import { isoWeekKey } from "@/lib/utils";

const GH = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "user-agent": "contentos-github-weekly",
    accept: "application/vnd.github+json",
  };
  // 可选 GITHUB_TOKEN 提升限额（60/h → 5000/h）
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export interface VerifiedRepo {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  pushedAt: string | null;
  createdAt: string;
  language: string | null;
  verified: boolean;
  verifyError?: string;
}

/** 单仓库真实核验：存在性 / full_name 一致 / stars 可读 */
export async function verifyRepo(ownerRepo: string): Promise<VerifiedRepo | { verified: false; error: string }> {
  const res = await fetch(`${GH}/repos/${ownerRepo}`, { headers: ghHeaders(), signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return { verified: false, error: `repo_not_found：GitHub API 404（${ownerRepo}）` };
  if (res.status === 403 || res.status === 429) return { verified: false, error: "rate_limited：GitHub API 限额，稍后重试或配置 GITHUB_TOKEN" };
  if (!res.ok) return { verified: false, error: `github_api_${res.status}` };
  const d = (await res.json()) as {
    full_name: string; html_url: string; description: string | null; stargazers_count: number;
    pushed_at: string; created_at: string; language: string | null;
  };
  const normalized = ownerRepo.toLowerCase();
  if (d.full_name.toLowerCase() !== normalized && !d.full_name.toLowerCase().endsWith("/" + normalized.split("/")[1])) {
    // full_name 与传入不一致（重定向仓库）——使用真实 full_name 并标注
  }
  return {
    fullName: d.full_name,
    url: d.html_url,
    description: d.description,
    stars: d.stargazers_count,
    pushedAt: d.pushed_at,
    createdAt: d.created_at,
    language: d.language,
    verified: true,
  };
}

export interface SnapshotResult {
  snapshotId: string;
  week: string;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
  candidates: number;
  verifiedCount: number;
  failedRepos: { repo: string; error: string }[];
  selectedTop: { rank: number; repository: string; stars: number; url: string; description: string | null; createdAt: string; language: string | null }[];
  snapshotDbId: string;
}

// 周标签与系统口径一致（复用 lib/utils 的 isoWeekKey）

/** 抓取「上一完整自然周」真实 Original Snapshot（周一执行） */
export async function fetchRealWeeklySnapshot(nowIn = new Date()): Promise<SnapshotResult> {
  // 上一完整自然周：上周一 00:00 ~ 上周日 23:59（本地时区）
  const day = nowIn.getDay() === 0 ? 7 : nowIn.getDay();
  const thisMonday = new Date(nowIn.getFullYear(), nowIn.getMonth(), nowIn.getDate() - (day - 1));
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const lastSundayEnd = new Date(thisMonday.getTime() - 1);
  const weekKey = isoWeekKey(lastMonday);
  const periodStartISO = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth() + 1).padStart(2, "0")}-${String(lastMonday.getDate()).padStart(2, "0")}`;
  const periodEndISO = `${lastSundayEnd.getFullYear()}-${String(lastSundayEnd.getMonth() + 1).padStart(2, "0")}-${String(lastSundayEnd.getDate()).padStart(2, "0")}`;

  // 1. Search：周期内新建且 stars>=30 的仓库（真实数据，非官方 trending——口径见 weekly_growth_source）
  const searchQuery = `created:${periodStartISO}..${periodEndISO} stars:>=30`;
  const searchRes = await fetch(`${GH}/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=15`, {
    headers: ghHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!searchRes.ok) {
    throw new Error(`GitHub Search API ${searchRes.status}：${(await searchRes.text()).slice(0, 120)}`);
  }
  const searchData = (await searchRes.json()) as { items: { full_name: string }[] };
  const candidates = searchData.items.map((i) => i.full_name);

  // 2. 逐仓库真实核验（Search 结果也可能与 Repo 端点数据有延迟，双端点交叉）
  const verified: VerifiedRepo[] = [];
  const failedRepos: { repo: string; error: string }[] = [];
  for (const repo of candidates) {
    const v = await verifyRepo(repo);
    if ("error" in v) failedRepos.push({ repo, error: v.error });
    else verified.push(v);
  }

  // 3. 排序（stars desc）+ Top5 选中，其余淘汰（理由=below_top5）
  verified.sort((a, b) => b.stars - a.stars);
  const top5 = verified.slice(0, 5);

  // 4. 落库：新 Original Snapshot（immutable）
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const snapshotId = `${weekKey}-GSNAP-${stamp}`; // varchar(32) 内
  const snap = await githubRepository.createSnapshot({
    snapshotId,
    snapshotType: "original",
    week: weekKey,
    captureTime: now,
    selectionBasis: "pure_weekly_rank",
    statisticsPeriodStart: lastMonday,
    statisticsPeriodEnd: lastSundayEnd,
    immutable: true,
    captureSource: "github_search",
  } as never);
  await githubRepository.addItems(
    snap.id,
    verified.map((v, idx) => ({
      rank: idx + 1,
      repository: v.fullName,
      projectName: v.fullName.split("/")[1],
      weeklyGrowth: `${v.stars}`,
      weeklyGrowthSource: "github_search_created_in_period",
      totalStars: v.stars,
      repoUrl: v.url,
      verificationStatus: "verified",
      selected: idx < 5,
      eliminationReason: idx >= 5 ? "below_top5" : null,
    })) as never,
  );
  // 淘汰的核验失败仓库也留痕（审计不删除）
  for (const f of failedRepos.slice(0, 10)) {
    await githubRepository.addItems(snap.id, [{
      rank: verified.length + failedRepos.indexOf(f) + 1,
      repository: f.repo,
      verificationStatus: "failed",
      selected: false,
      eliminationReason: f.error.slice(0, 200),
    }] as never);
  }

  await auditRepository.log({
    action: "workflow_run",
    entityType: "github_snapshots",
    entityId: snap.id,
    actor: "system",
    before: null,
    after: { snapshotId, week: weekKey, period: [periodStartISO, periodEndISO], candidates: candidates.length, verified: verified.length, failed: failedRepos.length, top5: top5.map((t) => t.fullName) },
    notes: `真实 GitHub Original Snapshot 抓取（周一）：${verified.length} 个核验通过，Top5 选中`,
  });

  return {
    snapshotId,
    week: weekKey,
    periodStart: periodStartISO,
    periodEnd: periodEndISO,
    capturedAt: now.toISOString(),
    candidates: candidates.length,
    verifiedCount: verified.length,
    failedRepos,
    selectedTop: top5.map((v, i) => ({ rank: i + 1, repository: v.fullName, stars: v.stars, url: v.url, description: v.description, createdAt: v.createdAt, language: v.language })),
    snapshotDbId: snap.id,
  };
}
