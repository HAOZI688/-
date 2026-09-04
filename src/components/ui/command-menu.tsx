"use client";

import * as React from "react";
import { Search, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { label: string; href: string; hint: string }[] = [
  { label: "运营工作台", href: "/dashboard", hint: "D" },
  { label: "本周内容计划", href: "/weekly-plan", hint: "W" },
  { label: "生产监控台", href: "/production", hint: "P" },
  { label: "待审核", href: "/review", hint: "R" },
  { label: "趋势雷达", href: "/trend-radar", hint: "T" },
  { label: "通知中心", href: "/notifications", hint: "N" },
  { label: "Topic 中心", href: "/topics", hint: "O" },
  { label: "数据分析", href: "/analytics", hint: "A" },
  { label: "涨粉归因", href: "/analytics/attribution", hint: "F" },
  { label: "小豆芽连接器", href: "/connectors/xiaodouya", hint: "C" },
  { label: "工作流", href: "/workflows", hint: "K" },
  { label: "执行记录", href: "/workflows/runs", hint: "E" },
  { label: "知识库", href: "/knowledge", hint: "G" },
  { label: "GitHub 周榜", href: "/github-weekly", hint: "H" },
  { label: "内容资产", href: "/content", hint: "A" },
  { label: "发布中心", href: "/publications", hint: "U" },
  { label: "内容日历", href: "/calendar", hint: "L" },
  { label: "社交账号", href: "/accounts", hint: "S" },
  { label: "设置", href: "/settings", hint: "M" },
];

interface SearchGroup {
  key: string;
  label: string;
  items: { title: string; subtitle?: string; href: string }[];
}

/** 全局搜索（V3 §5）：Cmd/Ctrl+K → 真实 DB 检索（/api/search）+ 页面直达 */
export function CommandMenu({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery("");
      setGroups([]);
    }
  }, [open]);

  // 300ms 防抖 → 真实 DB 搜索
  React.useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query.trim() }),
        });
        const data = (await res.json()) as { groups?: SearchGroup[] };
        setGroups(data.groups ?? []);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const navResults = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Topic、趋势、内容、发布…"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-400">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-auto p-1.5">
          {/* 页面直达 */}
          {navResults.length > 0 && (
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">页面</div>
          )}
          {navResults.map((n) => (
            <button
              key={n.href}
              onClick={() => {
                onNavigate(n.href);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-50"
            >
              <span>{n.label}</span>
              <span className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-400">{n.hint}</span>
            </button>
          ))}

          {/* 真实数据结果 */}
          {loading && <div className="px-3 py-6 text-center text-xs text-zinc-400">搜索中…</div>}
          {!loading &&
            groups.map((g) => (
              <div key={g.key} className="mt-2">
                <div className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{g.label}</div>
                {g.items.map((it, i) => (
                  <button
                    key={`${g.key}-${i}`}
                    onClick={() => {
                      onNavigate(it.href);
                      setOpen(false);
                    }}
                    className="flex w-full items-start justify-between gap-2 rounded-md px-3 py-1.5 text-left hover:bg-zinc-50"
                  >
                    <span className="min-w-0 truncate text-[13px]">{it.title}</span>
                    {it.subtitle && <span className="shrink-0 text-[10px] text-zinc-400">{it.subtitle}</span>}
                  </button>
                ))}
              </div>
            ))}

          {!loading && query.trim() && navResults.length === 0 && groups.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <FileText className="h-4 w-4 text-zinc-300" />
              <div className="text-xs text-zinc-400">没有匹配的结果</div>
            </div>
          )}
          {!query.trim() && navResults.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-zinc-400">输入关键词开始全局搜索</div>
          )}
        </div>
      </div>
    </div>
  );
}
