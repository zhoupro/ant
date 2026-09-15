import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCronNextRuns } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  CRON_PRESETS,
  type CronPreset,
  describeCronExpr,
  findPresetKey,
  humanizeFutureTime,
} from "./cron-utils";

interface CronPickerProps {
  value: string;
  onChange: (expr: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// 「定时调度」字段的输入控件:
//   - 顶部是常用预设按钮,点击即填入表达式;
//   - 底部一行自定义输入框,适合已经熟悉 cron 的运维;
//   - 选中后实时预览接下来 3 次的运行时间,所见即所得。
export function CronPicker({ value, onChange, disabled }: CronPickerProps) {
  const [customMode, setCustomMode] = useState(false);
  const [previewExpr, setPreviewExpr] = useState(value);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // 当前表达式命中预设 -> 高亮该按钮;否则自动切到自定义面板。
  const matchedPresetKey = useMemo(() => findPresetKey(value), [value]);
  useEffect(() => {
    if (!value) {
      setCustomMode(false);
      return;
    }
    if (matchedPresetKey === null) {
      setCustomMode(true);
    }
  }, [matchedPresetKey, value]);

  // 把即将发送预览的表达式与控件可见值同步,
  // 避免用户改预设时还显示上一次自定义框里的旧值。
  useEffect(() => {
    if (!customMode) {
      setPreviewExpr(value);
    }
  }, [value, customMode]);

  const refreshPreview = useCallback(async (expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) {
      setPreview(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getCronNextRuns(trimmed, 3);
      setPreview(res.runs);
      setNow(new Date());
      setError(null);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refreshPreview(previewExpr);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [previewExpr, refreshPreview]);

  const pickPreset = useCallback(
    (p: CronPreset) => {
      setCustomMode(false);
      onChange(p.expr);
      setPreviewExpr(p.expr);
    },
    [onChange],
  );

  const clearValue = useCallback(() => {
    onChange("");
    setPreviewExpr("");
    setPreview(null);
  }, [onChange]);

  return (
    <div className="space-y-2 rounded-lg border bg-transparent p-2">
      <div className="flex flex-wrap gap-1.5">
        {CRON_PRESETS.map((p) => {
          const active = matchedPresetKey === p.key && !customMode;
          return (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(p)}
              title={p.hint}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-dashed bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomMode(true);
            if (matchedPresetKey === null) {
              onChange(previewExpr);
            }
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs transition-colors",
            customMode
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-dashed bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <Sparkles className="mr-1 inline size-3" />
          自定义
        </button>
      </div>

      <div className="flex items-center gap-2">
        {customMode ? (
          <Input
            value={previewExpr}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setPreviewExpr(v);
              onChange(v);
            }}
            placeholder="分 时 日 月 周,例如 0 */2 * * *"
            className="h-8 flex-1 font-mono text-xs"
          />
        ) : (
          <div className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-muted/30 px-2 text-xs">
            <CalendarClock className="size-3.5 text-muted-foreground" />
            <span className="truncate font-medium">
              {describeCronExpr(value)}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {value || "—"}
            </span>
          </div>
        )}
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            aria-label="清空"
            onClick={clearValue}
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
        <div className="mb-0.5 flex items-center justify-between text-muted-foreground">
          <span>接下来 3 次运行</span>
          {loading ? <Loader2 className="size-3 animate-spin" /> : null}
        </div>
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : preview === null ? (
          <p className="text-muted-foreground">尚未选择调度</p>
        ) : preview.length === 0 ? (
          <p className="text-muted-foreground">没有未来的运行时间</p>
        ) : (
          <ul className="space-y-0.5">
            {preview.map((r, i) => {
              const t = humanizeFutureTime(r, now);
              return (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-foreground/80">{t.absolute}</span>
                  <span className="text-muted-foreground">{t.relative}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        存到数据库的是标准 5 段 cron 表达式;支持
        <code className="mx-1 rounded bg-muted px-1">*</code>
        <code className="mr-1 rounded bg-muted px-1">*/N</code>
        <code className="mr-1 rounded bg-muted px-1">a-b</code>
        <code className="mr-1 rounded bg-muted px-1">a,b</code>
        以及 <code className="rounded bg-muted px-1">@daily</code> /
        <code className="ml-1 rounded bg-muted px-1">@hourly</code> 等简写。
        <Button
          type="button"
          variant="link"
          size="xs"
          className="ml-1 h-auto p-0 text-[10px]"
          onClick={() => toast.info("详细语法请参考 crontab 手册(5 段: 分 时 日 月 周)。")}
        >
          详细语法
        </Button>
      </p>
    </div>
  );
}
