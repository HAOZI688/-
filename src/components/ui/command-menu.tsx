"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { label: string; href: string; hint: string }[] = [
  { label: "话题", href: "/topics", hint: "T" },
  { label: "Dashboard", href: "/dashboard", hint: "D" },
  { label: "工作流", href: "/workflows", hint: "W" },
  { label: "知识库", href: "/knowledge", hint: "K" },
  { label: "GitHub 周榜", href: "/github-weekly", hint: "G" },
  { label: "内容资产", href: "/content", hint: "C" },
  { label: "发布中心", href: "/publications", hint: "P" },
  { label: "数据分析", href: "/analytics", hint: "A" },
  { label: "设置", href: "/settings", hint: "S" },
];

export function CommandMenu({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

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
    else setQuery("");
  }, [open]);

  const results = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));

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
            placeholder="搜索页面…"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-400">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-6 text-center text-xs text-zinc-400">无匹配页面</div>}
          {results.map((n) => (
            <button
              key={n.href}
              onClick={() => {
                onNavigate(n.href);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-50",
              )}
            >
              <span>{n.label}</span>
              <span className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-400">{n.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
