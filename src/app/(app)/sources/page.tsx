import Link from "next/link";
import { listAllSourcePackets } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { fmtDate } from "@/lib/format";
import { SOURCE_TYPE_LABELS, VERIFICATION_LABELS, VERIFICATION_TONES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listAllSourcePackets();

  const counts: Record<string, number> = {};
  rows.forEach(({ packet }) => {
    counts[packet.consistency] = (counts[packet.consistency] ?? 0) + 1;
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">来源与核验</h1>
        <p className="text-xs text-zinc-500">
          Source_Packet：每个 Topic 一个来源包，包内逐条核验；关键数字必须附带可测试的核验条件，AI 生成内容一律基于本包事实。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {["verified", "partially_verified", "unverified", "conflict"].map((s) => (
          <Card key={s}>
            <CardContent className="flex items-center justify-between p-3">
              <StatusBadge label={VERIFICATION_LABELS[s]} tone={VERIFICATION_TONES[s]} />
              <span className="tabular text-lg font-semibold">{counts[s] ?? 0}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-xs text-zinc-400">
              暂无 Source Packet。通过「GitHub 周榜 / AI 周报」等工作流采集后，这里会出现与 Topic 一一对应的来源包。
            </CardContent>
          </Card>
        )}
        {rows.map(({ packet, topic }) => (
          <Card key={packet.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href={`/topics/${topic.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {topic.title}
                  </Link>
                  <span className="font-mono text-[10px] text-zinc-400">{topic.topicId}</span>
                </div>
                <StatusBadge label={`一致性：${VERIFICATION_LABELS[packet.consistency]}`} tone={VERIFICATION_TONES[packet.consistency]} />
              </div>
              {packet.notes && <p className="text-xs text-zinc-500">{packet.notes}</p>}
              <div className="text-[10px] text-zinc-400">更新于 {fmtDate(packet.updatedAt)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
