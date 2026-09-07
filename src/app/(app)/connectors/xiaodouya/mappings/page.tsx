import Link from "next/link";
import { connectorRepository } from "@/lib/repositories";
import { saveMappingTemplateAction } from "@/app/actions/v3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ===== 数据类型 → 中文标签（V3 §7：account/post/account_metrics/post_metrics） ===== */
const DATA_TYPE_LABELS: Record<string, string> = {
  account: "账号",
  post: "作品",
  account_metrics: "账号指标",
  post_metrics: "作品指标",
};

/** 一键保存的预设模板（固定样例，保存后可在导入时 Auto Detect 复用） */
const PRESET_TEMPLATES: {
  dataType: "account" | "post" | "account_metrics" | "post_metrics";
  name: string;
  columnMapping: Record<string, string>;
  buttonLabel: string;
}[] = [
  {
    dataType: "post",
    name: "小红书作品映射模板",
    columnMapping: {
      "作品ID": "external_post_id",
      "作品标题": "title",
      "发布时间": "published_at",
      "播放量": "views",
      "点赞数": "likes",
      "评论数": "comments",
      "分享数": "shares",
      "收藏数": "saves",
      "作品链接": "external_url",
    },
    buttonLabel: "保存小红书作品映射模板",
  },
  {
    dataType: "account",
    name: "抖音账号映射模板",
    columnMapping: {
      "账号名称": "account_name",
      "平台": "platform",
      "抖音号": "external_account_id",
      "粉丝数": "followers",
      "新增粉丝": "new_followers",
    },
    buttonLabel: "保存抖音账号模板",
  },
  {
    dataType: "post_metrics",
    name: "作品指标映射模板",
    columnMapping: {
      "作品ID": "external_post_id",
      "播放量": "views",
      "点赞数": "likes",
      "评论数": "comments",
      "分享数": "shares",
      "收藏数": "saves",
    },
    buttonLabel: "保存作品指标模板",
  },
];

/** requiredColumns（JSON 数组文本）→ 中文展示 */
function renderRequiredColumns(raw: string | null): string {
  if (!raw) return "—";
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.join("、") : raw;
  } catch {
    return raw;
  }
}

/** columnMapping（jsonb）→ JSON 预览（截断 200 字符） */
function renderMappingPreview(raw: unknown): string {
  try {
    const text = JSON.stringify(raw);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return "—";
  }
}

/**
 * 映射模板管理（规格 V3 §7）：不同导出版本字段映射复用。
 * 检测匹配逻辑 = requiredColumns 命中比例；模板 active 后才参与自动检测。
 */
export default async function MappingTemplatesPage() {
  const templates = await connectorRepository.listMappingTemplates();

  /** form action 契约返回 void：包装 saveMappingTemplateAction（绑定预设模板输入） */
  async function submitPreset(preset: (typeof PRESET_TEMPLATES)[number]) {
    "use server";
    await saveMappingTemplateAction({
      dataType: preset.dataType,
      name: preset.name,
      columnMapping: preset.columnMapping,
    });
  }

  return (
    <div className="space-y-4 p-4">
      {/* 顶部：标题 + 返回链接 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">映射模板管理</h1>
          <p className="text-xs text-zinc-500">
            CSV 导入时 Auto Detect 按 dataType 匹配模板：requiredColumns 命中比例最高者胜出；仅 active 模板参与自动检测。
          </p>
        </div>
        <Link href="/connectors/xiaodouya">
          <Button variant="outline">← 返回小豆芽连接</Button>
        </Link>
      </div>

      {/* 模板列表 */}
      <Card>
        <CardHeader><CardTitle>已保存模板</CardTitle></CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <EmptyState
              title="暂无映射模板"
              description="下方预设模板可一键保存；之后导入 CSV 时自动检测并复用。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>数据类型</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>期望列</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>列映射预览</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[160px] truncate font-medium text-zinc-800">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="blue">{DATA_TYPE_LABELS[t.dataType] ?? t.dataType}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">{t.version}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-zinc-600">{renderRequiredColumns(t.requiredColumns)}</TableCell>
                    <TableCell>
                      <Badge variant={t.active === 1 ? "green" : "default"}>
                        {t.active === 1 ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">{fmtDate(t.createdAt)}</TableCell>
                    <TableCell>
                      <code
                        className="block max-w-[240px] truncate rounded bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500"
                        title={renderMappingPreview(t.columnMapping)}
                      >
                        {renderMappingPreview(t.columnMapping)}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 保存新模板：预设样例一键保存 */}
      <Card>
        <CardHeader><CardTitle>保存新模板</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">
            检测匹配逻辑 = requiredColumns 命中比例（默认取映射前三列）；模板 active 后才参与自动检测。
            每个按钮绑定一组固定预设（dataType / name / columnMapping），一键保存即可复用。
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_TEMPLATES.map((preset) => (
              <form key={preset.buttonLabel} action={submitPreset.bind(null, preset)}>
                <Button size="sm">{preset.buttonLabel}</Button>
              </form>
            ))}
          </div>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-500">
            <div className="mb-1 font-semibold text-zinc-600">作品列映射样例</div>
            <code className="block overflow-x-auto whitespace-pre text-zinc-500">
{`{"作品ID":"external_post_id","作品标题":"title","发布时间":"published_at","播放量":"views","点赞数":"likes","评论数":"comments","分享数":"shares","收藏数":"saves","作品链接":"external_url"}`}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
