"use server";

import { revalidatePath } from "next/cache";
import { actionItemsService } from "@/lib/services/action-items";

/**
 * V4 Action Center Actions（规格 §26）。
 * 契约：form action 返回 void。
 */

/** 运营判断某事项无需处理 → dismiss（不参与自动 resolve 判断） */
export async function dismissActionItemAction(id: string) {
  await actionItemsService.dismiss(id);
  revalidatePath("/dashboard");
}
