"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { setTopicStatusAction } from "@/app/actions/topics";
import { TOPIC_STATUS_LABELS } from "@/lib/labels";

const FLOW: Record<string, string[]> = {
  draft: ["researching", "ready_for_production", "archived"],
  researching: ["ready_for_production", "review", "archived"],
  ready_for_production: ["producing", "review", "archived"],
  producing: ["review", "needs_revision", "ready_to_publish"],
  review: ["ready_to_publish", "needs_revision", "archived"],
  needs_revision: ["producing", "review"],
  ready_to_publish: ["published", "review"],
  published: ["archived"],
  archived: [],
};

export function TopicStatusAction({ topicId, status }: { topicId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = FLOW[status] ?? [];

  function change(next: string) {
    startTransition(async () => {
      await setTopicStatusAction(topicId, next);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value=""
        onChange={(e) => e.target.value && change(e.target.value)}
        className="h-8 w-32 text-xs"
      >
        <option value="">推进状态…</option>
        {options.map((o) => (
          <option key={o} value={o}>{TOPIC_STATUS_LABELS[o]} →</option>
        ))}
      </Select>
      {pending && <span className="text-[10px] text-zinc-400">保存中…</span>}
    </div>
  );
}
