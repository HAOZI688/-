"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { TopicFormDialog } from "./topic-form";
import {
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_TONES,
  TOPIC_TYPE_LABELS,
} from "@/lib/labels";
import type { Topic } from "@/lib/db/schema";

export function TopicsTable({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [status, setStatus] = React.useState(params.get("status") ?? "");
  const [type, setType] = React.useState(params.get("type") ?? "");
  const [open, setOpen] = React.useState(false);

  const filtered = topics.filter((t) => {
    const okQ = !q || t.title.toLowerCase().includes(q.toLowerCase()) || t.topicId.toLowerCase().includes(q.toLowerCase());
    const okS = !status || t.status === status;
    const okT = !type || t.topicType === type;
    return okQ && okS && okT;
  });

  function syncParams(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`/topics?${p.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Input
            placeholder="搜索标题 / Topic ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56"
          />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); syncParams("status", e.target.value); }} className="w-32">
            <option value="">全部状态</option>
            {Object.entries(TOPIC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={type} onChange={(e) => { setType(e.target.value); syncParams("type", e.target.value); }} className="w-32">
            <option value="">全部分类</option>
            {Object.entries(TOPIC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <Button onClick={() => setOpen(true)}>＋ 新建 Topic</Button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topic</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>评分</TableHead>
              <TableHead>CTA</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="max-w-md">
                  <Link href={`/topics/${t.id}`} className="font-medium text-zinc-800 hover:text-blue-600">
                    {t.title}
                  </Link>
                  <div className="text-[10px] text-zinc-400">{t.topicId}</div>
                </TableCell>
                <TableCell><StatusBadge label={TOPIC_TYPE_LABELS[t.topicType] ?? t.topicType} tone="outline" /></TableCell>
                <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                <TableCell><StatusBadge label={TOPIC_STATUS_LABELS[t.status]} tone={TOPIC_STATUS_TONES[t.status]} /></TableCell>
                <TableCell className="tabular text-xs text-zinc-600">
                  <div className="flex gap-2">
                    <span title="B2B 相关性">{t.b2bRelevance ?? "—"}</span>
                    <span className="text-zinc-300">·</span>
                    <span title="流量">{t.trafficPotential ?? "—"}</span>
                    <span className="text-zinc-300">·</span>
                    <span title="转化">{t.conversionPotential ?? "—"}</span>
                    <span className="text-zinc-300">·</span>
                    <span title="时效">{t.timeliness ?? "—"}</span>
                    <span className="text-zinc-300">·</span>
                    <span title="内容价值">{t.contentValue ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-xs text-zinc-500">{t.primaryCta ?? "—"}</TableCell>
                <TableCell className="tabular text-xs text-zinc-500">
                  {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString("zh-CN") : "—"}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-zinc-400">
                  暂无匹配 Topic
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {open && <TopicFormDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
