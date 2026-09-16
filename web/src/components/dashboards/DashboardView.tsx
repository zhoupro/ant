import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runDashboardCard } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CardConfig,
  CardRunResponse,
  DashboardCard,
  DashboardDetail,
} from "@/features/dashboards/types";
import { decodeDashboardConfig } from "@/features/dashboards/types";
import { LineChart } from "./LineChart";

interface DashboardViewProps {
  detail: DashboardDetail;
  className?: string;
}

// DashboardView 是聚合页的运行时入口:
// 1) 拉取 dashboard + cards 清单;
// 2) 每张卡片并发调用 /run,缓存结果;
// 3) 按 card.kind 渲染为数字 / 表格 / 折线图。
// 整个组件对 SQL 执行失败是健壮的:失败的卡片单独显示错误,不影响其它卡片。
export function DashboardView({ detail, className }: DashboardViewProps) {
  const cards = useMemo(() => detail.cards ?? [], [detail.cards]);
  const [runs, setRuns] = useState<Record<string, CardRunResponse>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  // 聚合页的刷新逻辑:
  // - 手动刷新按钮(RefreshCw) 立即再拉一次;
  // - 自动刷新定时器(setInterval) 每 N 秒再拉一次,可在运行时打开 / 关闭;
  // - 秒数从 dashboard config 里取(每个聚合页可单独配置),也允许运行时调整。
  const cfg = useMemo(
    () => decodeDashboardConfig(detail.dashboard.config),
    [detail.dashboard.config],
  );
  const initialSeconds =
    cfg.refresh_seconds && cfg.refresh_seconds > 0 ? cfg.refresh_seconds : 30;
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    cfg.refresh_seconds != null && cfg.refresh_seconds > 0,
  );
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(initialSeconds);
  const [autoRefreshInput, setAutoRefreshInput] = useState(
    String(initialSeconds),
  );
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(0);
  const autoRefreshTickRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoaded(false);
    setRuns({});
    setErrors({});
    const tasks = cards.map(async (card) => {
      try {
        const resp = await runDashboardCard(detail.dashboard.id, card.id);
        return { id: card.id, ok: true, data: resp };
      } catch (err) {
        return {
          id: card.id,
          ok: false,
          msg: err instanceof Error ? err.message : "执行失败",
        };
      }
    });
    const settled = await Promise.all(tasks);
    const nextRuns: Record<string, CardRunResponse> = {};
    const nextErr: Record<string, string> = {};
    for (const s of settled) {
      if (s.ok && s.data) {
        nextRuns[s.id] = s.data;
      } else if (!s.ok) {
        nextErr[s.id] = s.msg ?? "执行失败";
      }
    }
    setRuns(nextRuns);
    setErrors(nextErr);
    setLoaded(true);
  }, [cards, detail.dashboard.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefreshEnabled || autoRefreshSeconds <= 0) {
      if (autoRefreshTickRef.current !== null) {
        window.clearInterval(autoRefreshTickRef.current);
        autoRefreshTickRef.current = null;
      }
      setSecondsUntilRefresh(0);
      return;
    }
    setSecondsUntilRefresh(autoRefreshSeconds);
    autoRefreshTickRef.current = window.setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          void refresh();
          return autoRefreshSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (autoRefreshTickRef.current !== null) {
        window.clearInterval(autoRefreshTickRef.current);
        autoRefreshTickRef.current = null;
      }
    };
  }, [autoRefreshEnabled, autoRefreshSeconds, refresh]);

  return (
    <div className={cn("space-y-3", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <h3 className="text-sm font-semibold">{detail.dashboard.label}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={cards.length === 0}
            title="手动执行所有卡片 SQL"
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
          <div className="inline-flex items-center gap-1">
            <Input
              type="number"
              min={1}
              step={1}
              value={autoRefreshInput}
              onChange={(e) => {
                const v = e.target.value;
                setAutoRefreshInput(v);
                const n = Number.parseInt(v, 10);
                if (Number.isFinite(n) && n > 0) {
                  setAutoRefreshSeconds(n);
                  if (autoRefreshEnabled) setSecondsUntilRefresh(n);
                }
              }}
              onBlur={() => {
                const n = Number.parseInt(autoRefreshInput, 10);
                if (!Number.isFinite(n) || n < 1) {
                  setAutoRefreshInput(String(autoRefreshSeconds));
                }
              }}
              className="h-7 w-16 px-2 text-xs"
              aria-label="自动刷新秒数"
              title="自动刷新秒数"
              disabled={cards.length === 0}
            />
            <span className="text-[10px] text-muted-foreground">秒</span>
            <Button
              size="sm"
              variant={autoRefreshEnabled ? "default" : "outline"}
              onClick={() => setAutoRefreshEnabled((v) => !v)}
              aria-label={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
              title={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
              disabled={cards.length === 0}
            >
              {autoRefreshEnabled ? (
                <>
                  <Pause className="size-3.5" />
                  {secondsUntilRefresh}s
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  自动
                </>
              )}
            </Button>
          </div>
        </div>
      </header>
      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
          这个统计中心还没有配置任何卡片,到「统计」Tab 里新增一张。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <CardSurface
              key={card.id}
              card={card}
              run={runs[card.id]}
              error={errors[card.id]}
              loaded={loaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardSurfaceProps {
  card: DashboardCard;
  run: CardRunResponse | undefined;
  error: string | undefined;
  loaded: boolean;
}

function CardSurface({ card, run, error, loaded }: CardSurfaceProps) {
  const hasRows = !!run && run.rows.length > 0;
  return (
    <article className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm">
      <header className="flex items-baseline justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">
          {card.title}
        </h4>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {card.kind === "line_chart" ? "折线图" : "数字 / 表格"}
        </span>
      </header>
      {!loaded ? (
        <p className="flex items-center gap-1 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> 执行中…
        </p>
      ) : error ? (
        <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : !run ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          查询无返回数据
        </p>
      ) : !hasRows ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          查询无返回数据
        </p>
      ) : card.kind === "line_chart" ? (
        <LineChartCardBody run={run} />
      ) : (
        <NumberCardBody run={run} />
      )}
    </article>
  );
}

function NumberCardBody({ run }: { run: CardRunResponse }) {
  const config: CardConfig = run.config ?? {};
  const decimals = config.decimals ?? 0;
  const columns = useMemo(() => run.columns ?? [], [run.columns]);
  const labelMap = useMemo(() => config.columns ?? {}, [config.columns]);

  if (run.rows.length === 1 && columns.length === 1) {
    const firstCol = columns[0] ?? "";
    const value = run.rows[0]?.[firstCol];
    return (
      <div className="flex items-baseline gap-1 py-2">
        <span className="text-2xl font-semibold tabular-nums">
          {formatNumber(value, decimals)}
        </span>
        {config.unit ? (
          <span className="text-xs text-muted-foreground">{config.unit}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c}
                className="px-1 py-1 text-left font-medium"
                title={c}
              >
                {labelMap[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {run.rows.slice(0, 10).map((row, i) => (
            <tr key={i} className="border-t border-border/40">
              {columns.map((c) => (
                <td key={c} className="px-1 py-1 align-top tabular-nums">
                  {formatCell(row[c], c, decimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {run.rows.length > 10 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          仅展示前 10 行 / 共 {run.rows.length} 行
        </p>
      ) : null}
    </div>
  );
}

function LineChartCardBody({ run }: { run: CardRunResponse }) {
  const config: CardConfig = run.config ?? {};
  const columns = useMemo(() => run.columns ?? [], [run.columns]);
  const xKey = config.x_column || columns[0];
  const labelMap = useMemo(() => config.columns ?? {}, [config.columns]);
  const yColumns = useMemo(() => {
    if (config.y_columns && config.y_columns.length > 0) {
      // 顺序按用户配置走;列不存在则跳过,避免前端崩溃。
      return config.y_columns.filter((c) => columns.includes(c));
    }
    return columns.filter((c) => c !== xKey);
  }, [columns, config.y_columns, xKey]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const labels = useMemo(
    () => run.rows.map((row) => String(row[xKey ?? ""] ?? "")),
    [run.rows, xKey],
  );
  const series = useMemo(
    () =>
      yColumns.map((col, i) => ({
        key: col,
        label: labelMap[col] ?? col,
        color: PALETTE[i % PALETTE.length],
        values: run.rows.map((row) => parseNumber(row[col])),
      })),
    [run.rows, yColumns, labelMap],
  );

  if (!xKey) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        没有可用的 X 轴列
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <LineChart
        labels={labels}
        series={series}
        hidden={hidden}
        onToggle={(key) =>
          setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        height={180}
      />
    </div>
  );
}

const PALETTE = ["#0ea5e9", "#f97316", "#10b981", "#a855f7", "#f43f5e"];

function parseNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatNumber(v: unknown, decimals: number): string {
  const n = parseNumber(v);
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCell(v: unknown, _col: string, decimals: number): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return formatNumber(v, decimals);
  }
  return String(v);
}
