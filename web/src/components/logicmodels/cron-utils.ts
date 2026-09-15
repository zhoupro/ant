// 常用 cron 调度模板 —— 用户在前端点选,无需知道 cron 语法即可上手。
// `expr` 与「定时」业务类型存储的标准 5 段表达式严格一致。
export interface CronPreset {
  key: string;
  label: string;
  hint: string;
  expr: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { key: "every_minute", label: "每分钟", hint: "用于心跳 / 联调测试", expr: "* * * * *" },
  { key: "every_5m", label: "每 5 分钟", hint: "高频巡检", expr: "*/5 * * * *" },
  { key: "every_15m", label: "每 15 分钟", hint: "中等频率", expr: "*/15 * * * *" },
  { key: "every_30m", label: "每 30 分钟", hint: "半小时间隔", expr: "*/30 * * * *" },
  { key: "hourly", label: "每小时", hint: "整点执行", expr: "0 * * * *" },
  { key: "daily_midnight", label: "每天 0 点", hint: "夜间批量", expr: "0 0 * * *" },
  { key: "daily_3am", label: "每天 3 点", hint: "凌晨低峰", expr: "0 3 * * *" },
  { key: "weekly_mon", label: "每周一 0 点", hint: "周报生成", expr: "0 0 * * 1" },
  { key: "monthly_1st", label: "每月 1 日 0 点", hint: "月度对账", expr: "0 0 1 * *" },
  { key: "weekday_9am", label: "工作日 9 点", hint: "上班时间", expr: "0 9 * * 1-5" },
];

// 把 cron 表达式翻译成用户能一眼看懂的描述。
// 这里只覆盖 CRON_PRESETS 中的标准模板;不在表内的统一回落到「自定义」。
export function describeCronExpr(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) return "未设置";
  const hit = CRON_PRESETS.find((p) => p.expr === trimmed);
  if (hit) return hit.label;
  // 一些常见的步进模式,例如 */N * * * *
  const m = /^ \*\/(\d+) \* \* \* \*$/.exec(trimmed);
  if (m) return `每 ${m[1]} 分钟`;
  return "自定义调度";
}

// 找到与给定表达式匹配的预设 key,没有就返回 null。
// 用于在「定时」输入控件里把已有值反显到正确的预设按钮上。
export function findPresetKey(expr: string): string | null {
  const hit = CRON_PRESETS.find((p) => p.expr === expr.trim());
  return hit?.key ?? null;
}

// 把 ISO/RFC3339 时间戳格式化成更友好的中文展示:
//   "今天 14:30" / "明天 09:00" / "2026-10-02 09:00"
// 距离现在多远也一并算好(相对描述,例如「5 分钟后」)。
export interface HumanTime {
  absolute: string;
  relative: string;
}

export function humanizeFutureTime(targetIso: string, now = new Date()): HumanTime {
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) {
    return { absolute: targetIso, relative: "" };
  }
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  let prefix = "";
  if (sameDay) prefix = "今天 ";
  else if (isTomorrow) prefix = "明天 ";
  else prefix = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())} `;
  const absolute = `${prefix}${time}`;

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return { absolute, relative: "即将运行" };
  const diffMin = Math.round(diffMs / 60000);
  let relative = "";
  if (diffMin < 1) relative = "1 分钟内";
  else if (diffMin < 60) relative = `${diffMin} 分钟后`;
  else if (diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    relative = m > 0 ? `${h} 小时 ${m} 分后` : `${h} 小时后`;
  } else {
    const d = Math.floor(diffMin / (60 * 24));
    const h = Math.round((diffMin - d * 60 * 24) / 60);
    relative = h > 0 ? `${d} 天 ${h} 小时后` : `${d} 天后`;
  }
  return { absolute, relative };
}
