"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Lightbulb,
  Newspaper,
  Workflow,
  BookOpen,
  Github,
  FileText,
  Send,
  BarChart3,
  Settings,
  Command,
  Sparkles,
  Network,
  CalendarDays,
  Users,
  Database,
  Upload,
  Bell,
  Radar,
  Factory,
  ClipboardList,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/ui/command-menu";
import { useRouter } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "总览",
    items: [
      { href: "/dashboard", label: "运营工作台", icon: LayoutDashboard },
      { href: "/weekly-plan", label: "本周内容计划", icon: ClipboardList },
      { href: "/review", label: "待审核", icon: FileText },
      { href: "/notifications", label: "通知中心", icon: Bell },
      { href: "/topics", label: "Topic 中心", icon: Lightbulb },
      { href: "/topic-graph", label: "Topic 关系图谱", icon: Network },
    ],
  },
  {
    label: "生产",
    items: [
      { href: "/production", label: "生产监控台", icon: Factory },
      { href: "/trend-radar", label: "趋势雷达", icon: Radar },
      { href: "/workflows", label: "工作流", icon: Workflow },
      { href: "/workflows/runs", label: "执行记录", icon: Newspaper },
      { href: "/sources", label: "来源与核验", icon: FileText },
      { href: "/content", label: "内容资产", icon: Sparkles },
      { href: "/knowledge", label: "常青知识库", icon: BookOpen },
      { href: "/github-weekly", label: "GitHub 周榜", icon: Github },
      { href: "/publish-packages", label: "发布包", icon: Package },
      { href: "/publish-packages/assets", label: "品牌资产", icon: Package },
    ],
  },
  {
    label: "分发",
    items: [
      { href: "/publications", label: "发布中心", icon: Send },
      { href: "/calendar", label: "内容日历", icon: CalendarDays },
      { href: "/accounts", label: "社交账号", icon: Users },
      { href: "/analytics", label: "数据分析", icon: BarChart3 },
      { href: "/analytics/attribution", label: "涨粉归因", icon: BarChart3 },
    ],
  },
  {
    label: "数据集成",
    items: [
      { href: "/connectors/xiaodouya", label: "小豆芽", icon: Database },
      { href: "/connectors/xiaodouya/mappings", label: "映射模板", icon: Database },
      { href: "/data-import", label: "数据导入", icon: Upload },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/settings", label: "设置", icon: Settings },
      { href: "/system/readiness", label: "生产就绪检查", icon: Factory },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-12 items-center gap-2 border-b border-zinc-100 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-[11px] font-bold text-white">
            C
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Content OS</div>
            <div className="text-[10px] text-zinc-400">AI CONTENT OPS</div>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        active
                          ? "bg-blue-50 font-medium text-blue-700"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-zinc-100 p-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-100"
          >
            <Command className="h-3.5 w-3.5" />
            快速跳转
            <kbd className="ml-auto rounded border border-zinc-200 bg-white px-1 text-[9px]">⌘K</kbd>
          </button>
          {/* V4：登出（登录后显示；未配置凭证时隐藏） */}
          <form action="/api/auth/logout" method="post" className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
            >
              退出登录
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
          <div className="text-sm font-medium text-zinc-700">
            AI 社交内容运营平台
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              本地工作台
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandMenu onNavigate={(href) => router.push(href)} />
    </div>
  );
}
