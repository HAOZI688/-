import { notificationService } from "@/lib/services/notification";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  sweepNotificationsAction,
} from "@/app/actions/v3";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 通知类型 → 中文标签 */
const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  weekly_plan_ready: "周计划已生成",
  workflow_failed: "工作流失败",
  content_needs_review: "内容待审核",
  publication_needs_confirmation: "发布待确认",
  data_sync_failed: "数据同步失败",
  unmatched_external_post: "作品未匹配",
  metrics_stale: "数据过期",
  trend_p0_detected: "P0 趋势",
  attribution_completed: "归因完成",
};

/** 严重级别 → 徽标配色 */
const SEVERITY_TONES: Record<string, "blue" | "orange" | "red" | "green" | "default"> = {
  info: "blue",
  warning: "orange",
  error: "red",
  success: "green",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "信息",
  warning: "警告",
  error: "错误",
  success: "成功",
};

export default async function NotificationsPage() {
  const [notifications, unread] = await Promise.all([
    notificationService.list(100),
    notificationService.countUnread(),
  ]);

  return (
    <div className="space-y-4 p-4">
      {/* 顶部：标题 + 未读数 + 操作按钮 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">通知中心</h1>
          <p className="text-xs text-zinc-500">
            {unread > 0 ? (
              <span className="font-medium text-blue-600">{unread} 条未读</span>
            ) : (
              "全部已读"
            )}
            <span className="ml-2">归因完成、周期检查、数据同步等系统事件。</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={markAllNotificationsReadAction}>
            <Button variant="outline">全部已读</Button>
          </form>
          <form action={sweepNotificationsAction}>
            <Button>执行周期检查</Button>
          </form>
        </div>
      </div>

      {/* 通知列表 */}
      <Card>
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <EmptyState title="暂无通知" description="归因完成、周期检查等系统事件会在这里出现。" />
          ) : (
            <div className="divide-y divide-zinc-100">
              {notifications.map((n) => {
                const isUnread = n.read === 0;
                const typeLabel = NOTIFICATION_TYPE_LABELS[n.type] ?? n.type;
                const severityTone = SEVERITY_TONES[n.severity] ?? "default";
                const severityLabel = SEVERITY_LABELS[n.severity] ?? n.severity;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3",
                      isUnread && "bg-blue-50/40",
                    )}
                  >
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <StatusBadge label={severityLabel} tone={severityTone} />
                      <span className="hidden text-[11px] text-zinc-400 sm:inline">{typeLabel}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-800">
                        {n.link ? (
                          <a href={n.link} className="hover:text-blue-600">
                            {n.title}
                          </a>
                        ) : (
                          n.title
                        )}
                      </div>
                      {n.message && <p className="mt-0.5 text-xs text-zinc-500">{n.message}</p>}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="whitespace-nowrap text-[10px] text-zinc-400">{fmtDate(n.createdAt)}</span>
                      {isUnread && (
                        <form action={markNotificationReadAction.bind(null, n.id)}>
                          <Button size="sm" variant="outline">
                            标为已读
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
