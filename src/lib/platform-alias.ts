/**
 * B-2：平台名归一（/screen 抄数 / 人工 CSV 的平台列可能是中文名或大小写变体）。
 * 账号导入与作品导入共用，确保 platform 落库为系统枚举值。
 */
const PLATFORM_ALIASES: Record<string, string> = {
  抖音: "douyin", douyin: "douyin", douyin创作者中心: "douyin",
  小红书: "xiaohongshu", xiaohongshu: "xiaohongshu", 小红书创作服务平台: "xiaohongshu",
  b站: "bilibili", 哔哩哔哩: "bilibili", bilibili: "bilibili",
  视频号: "wechat_video", 微信视频号: "wechat_video", wechat_video: "wechat_video", channels: "wechat_video",
  公众号: "wechat", 微信公众号: "wechat", wechat: "wechat", mp: "wechat",
  快手: "kuaishou", kuaishou: "kuaishou",
  其他: "other", other: "other",
};

/** 平台名归一：中文名/大小写/含空格 → 系统枚举；未知值小写透传（导入行不因平台名失败） */
export function normalizePlatform(raw: string | undefined | null): string {
  if (!raw) return "other";
  const key = String(raw).trim().toLowerCase();
  return PLATFORM_ALIASES[key] ?? key;
}
