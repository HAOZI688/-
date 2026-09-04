"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { topics } from "@/lib/db/schema";

export interface TopicFormInput {
  topicId?: string;
  title: string;
  description?: string;
  topicType: string;
  priority: string;
  status: string;
  b2bRelevance?: number;
  trafficPotential?: number;
  conversionPotential?: number;
  timeliness?: number;
  contentValue?: number;
  primaryCta?: string;
  parentTopicId?: string;
  sourceTopicIds?: string[];
  trendTags?: string[];
}

function scoreToPriority(scores: { b2b?: number; traffic?: number; conversion?: number; timeliness?: number; content?: number }): string {
  const avg = [scores.b2b, scores.traffic, scores.conversion, scores.timeliness, scores.content]
    .filter((v): v is number => v !== undefined && v > 0)
    .reduce((a, b) => a + b, 0) / 5;
  if (avg >= 8) return "P0";
  if (avg >= 6) return "P1";
  if (avg >= 4) return "P2";
  return "P3";
}

export async function createTopicAction(input: TopicFormInput) {
  const autoPriority = scoreToPriority({
    b2b: input.b2bRelevance,
    traffic: input.trafficPotential,
    conversion: input.conversionPotential,
    timeliness: input.timeliness,
    content: input.contentValue,
  });
  const now = new Date();
  const topicId =
    input.topicId?.trim() ||
    `W${now.getFullYear()}-${String(Math.floor(now.getMonth() / 3) + 1)}-${String(Date.now() % 10000).padStart(4, "0")}`;
  const [row] = await db
    .insert(topics)
    .values({
      topicId,
      title: input.title,
      description: input.description || null,
      topicType: input.topicType as never,
      priority: (input.priority || autoPriority) as never,
      status: input.status as never,
      b2bRelevance: input.b2bRelevance,
      trafficPotential: input.trafficPotential,
      conversionPotential: input.conversionPotential,
      timeliness: input.timeliness,
      contentValue: input.contentValue,
      primaryCta: input.primaryCta || null,
      parentTopicId: input.parentTopicId || null,
      sourceTopicIds: input.sourceTopicIds?.length ? input.sourceTopicIds : [],
      trendTags: input.trendTags?.length ? input.trendTags : [],
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  revalidatePath("/topics");
  revalidatePath("/dashboard");
  return row;
}

export async function updateTopicAction(id: string, input: Partial<TopicFormInput>) {
  const now = new Date();
  const [row] = await db
    .update(topics)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.topicType ? { topicType: input.topicType as never } : {}),
      ...(input.priority ? { priority: input.priority as never } : {}),
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.b2bRelevance !== undefined ? { b2bRelevance: input.b2bRelevance } : {}),
      ...(input.trafficPotential !== undefined ? { trafficPotential: input.trafficPotential } : {}),
      ...(input.conversionPotential !== undefined ? { conversionPotential: input.conversionPotential } : {}),
      ...(input.timeliness !== undefined ? { timeliness: input.timeliness } : {}),
      ...(input.contentValue !== undefined ? { contentValue: input.contentValue } : {}),
      ...(input.primaryCta !== undefined ? { primaryCta: input.primaryCta || null } : {}),
      ...(input.trendTags ? { trendTags: input.trendTags } : {}),
      updatedAt: now,
    })
    .where(eq(topics.id, id))
    .returning();
  revalidatePath("/topics");
  revalidatePath("/topics/" + id);
  revalidatePath("/dashboard");
  return row;
}

export async function setTopicStatusAction(id: string, status: string) {
  const [row] = await db
    .update(topics)
    .set({ status: status as never, updatedAt: new Date() })
    .where(eq(topics.id, id))
    .returning();
  revalidatePath("/topics/" + id);
  revalidatePath("/topics");
  revalidatePath("/dashboard");
  return row;
}
