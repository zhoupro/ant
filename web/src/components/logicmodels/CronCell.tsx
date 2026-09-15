import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getCronNextRuns } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  describeCronExpr,
  humanizeFutureTime,
} from "./cron-utils";

interface CronCellProps {
  value: string;
  // 在表格里点击「值」本身是否触发行级跳转;
  // 默认情况下单元格自身可点,行不会同时被点开详情。
  stopRowClick?: boolean;
}

// 「定时调度」字段在表格里的渲染:
//   - 默认只显示一行「每 5 分钟 / 每天 0 点」之类的人类可读标签;
//   - 点击展开一个气泡/对话框,列出接下来 5 次运行时间 + 相对描述。
export function CronCell({ value, stopRowClick = true }: CronCellProps) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const requestedRef = useRef<string | null>(null);

  const fetchRuns = useCallback(async (expr: string) => {
    if (requestedRef.current === expr) return;
    requestedRef.current = expr;
    setLoading(true);
    setError(null);
    try {
      const res = await getCronNextRuns(expr, 5);
      setRuns(res.runs);
      setNow(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && value) {
      void fetchRuns(value);
    }
  }, [open, value, fetchRuns]);

  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }

  const label = describeCronExpr(value);

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted",
          "border-dashed text-foreground/80",
        )}
        title={`点击查看接下来 5 次运行时间 · ${value}`}
        onClick={(e) => {
          if (stopRowClick) e.stopPropagation();
          setOpen(true);
        }}
      >
        <CalendarClock className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
        title={`调度预览 · ${label}`}
        description={
          <span className="font-mono text-xs text-muted-foreground">
            {value}
          </span>
        }
        size="md"
        footer={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X className="size-3.5" />
            关闭
          </Button>
        }
      >
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              正在计算接下来的运行时间…
            </div>
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : runs === null || runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              没有未来的运行时间,请检查表达式是否合法。
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                以下时间以服务器时区为准;「相对」是距当前时刻的差值。
              </p>
              <ul className="divide-y rounded-md border bg-card">
                {runs.map((r, i) => {
                  const t = humanizeFutureTime(r, now);
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">
                          {i + 1}
                        </span>
                        <CalendarClock className="size-3.5 text-muted-foreground" />
                        <span className="font-medium">{t.absolute}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {t.relative}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <details className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  查看原始 ISO 时间戳
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {runs.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
