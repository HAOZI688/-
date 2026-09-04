"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { createTopicAction, type TopicFormInput } from "@/app/actions/topics";

const TYPES = ["hot", "evergreen", "technical_project", "scenario", "product", "conversion", "trend", "knowledge"];
const STATUSES = [
  "draft",
  "researching",
  "ready_for_production",
  "producing",
  "review",
  "needs_revision",
  "ready_to_publish",
  "published",
  "archived",
];
const PRIORITIES = ["P0", "P1", "P2", "P3"];

const TYPE_LABEL: Record<string, string> = {
  hot: "热点", evergreen: "常青", technical_project: "技术项目", scenario: "场景",
  product: "产品", conversion: "转化", trend: "趋势", knowledge: "知识",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "草稿", researching: "调研中", ready_for_production: "可生产", producing: "生产中",
  review: "审核中", needs_revision: "需修改", ready_to_publish: "可发布", published: "已发布", archived: "已归档",
};

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-24 shrink-0">{label}</Label>
      <input
        type="range" min={1} max={10} value={value || 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-600"
      />
      <span className="tabular w-4 text-right text-xs font-medium text-blue-700">{value || 1}</span>
    </div>
  );
}

export function TopicFormDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<TopicFormInput>({
    title: "", topicType: "trend", priority: "P3", status: "draft",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await createTopicAction({ ...form, title: form.title.trim() });
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">新建 Topic</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <Label>标题</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：Agent Skills 趋势观察" className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>类型</Label>
              <Select value={form.topicType} onChange={(e) => setForm({ ...form, topicType: e.target.value })} className="mt-1">
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            </div>
            <div>
              <Label>优先级</Label>
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="mt-1">
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <Label>状态</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>描述</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} placeholder="选题背景、业务相关性" />
          </div>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-zinc-500">五维评分（自动映射优先级）</div>
            <div className="space-y-1">
              <ScoreInput label="B2B 相关性" value={form.b2bRelevance ?? 1} onChange={(v) => setForm({ ...form, b2bRelevance: v })} />
              <ScoreInput label="流量潜力" value={form.trafficPotential ?? 1} onChange={(v) => setForm({ ...form, trafficPotential: v })} />
              <ScoreInput label="转化潜力" value={form.conversionPotential ?? 1} onChange={(v) => setForm({ ...form, conversionPotential: v })} />
              <ScoreInput label="时效性" value={form.timeliness ?? 1} onChange={(v) => setForm({ ...form, timeliness: v })} />
              <ScoreInput label="内容价值" value={form.contentValue ?? 1} onChange={(v) => setForm({ ...form, contentValue: v })} />
            </div>
          </div>
          <div>
            <Label>主 CTA（每个 Topic 只允许一个）</Label>
            <Input value={form.primaryCta ?? ""} onChange={(e) => setForm({ ...form, primaryCta: e.target.value })} className="mt-1" placeholder="例如：点击预约演示" />
          </div>
          <div>
            <Label>趋势标签（逗号分隔）</Label>
            <Input value={(form.trendTags ?? []).join(", ")} onChange={(e) => setForm({ ...form, trendTags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })} className="mt-1" placeholder="agent, workflow" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={busy || !form.title.trim()}>
            {busy ? "保存中…" : "保存 Topic"}
          </Button>
        </div>
      </div>
    </div>
  );
}
