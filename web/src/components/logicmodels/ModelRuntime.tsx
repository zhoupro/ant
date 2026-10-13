import { JsonEditor } from "./JsonEditor";
import { formatJsonOrNull } from "./jsonFormat";
import { CronCell } from "./CronCell";
import { CronPicker } from "./CronPicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  createRuntimeRow,
  deleteModel,
  deleteRuntimeRow,
  getRuntimeRow,
  getRuntimeSchema,
  listRuntimeRows,
  updateRuntimeRow,
  uploadFile,
} from "@/lib/api";
import { absoluteUrl } from "@/lib/api";
import type {
  ExpandedRow,
  RowMutationInput,
  RuntimeField,
  RuntimeSchema,
  SelectOption,
} from "@/features/logicmodels/types";

const RUNTIME_STORAGE_PREFIX = "mc:runtime:";

// 筛选下拉:单值 "now+Ns",后端 SQL 是 col > now+Ns(命中所有大于此偏移的记录)。
// 与 ModelEditor 中的颜色规则编辑器的"区间 key"独立:filter 用单值,
// 颜色规则按"差值落在哪个区间"分档。
const DATE_FILTER_PRESETS: { value: string; label: string }[] = [
  { value: "now+0s", label: "大于当前 0 秒" },
  { value: "now+30s", label: "大于当前 30 秒" },
  { value: "now+1m", label: "大于当前 1 分钟" },
  { value: "now+5m", label: "大于当前 5 分钟" },
  { value: "now+15m", label: "大于当前 15 分钟" },
  { value: "now+1h", label: "大于当前 1 小时" },
  { value: "now+1d", label: "大于当前 1 天" },
];

// 把 "now+30s" 这种单值解析为相对当前的毫秒数,供染色区间比较用。
function nowOffsetToMs(spec: string): number | null {
  const m = /^now\s*([+-])\s*(\d+)\s*([smhd]?)$/i.exec(spec.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = Number(m[2]);
  const unit = m[3].toLowerCase();
  const mul =
    unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 1_000;
  return sign * n * mul;
}

// formatOffsetMs 把毫秒数格式化为 "30s / 5m / 2h / 1d" 这种最简记法,自选最大单位。
function formatOffsetMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

// 染色区间 key "now+30s~now+1m" / "now+1d~" 解析为 (lower, upper) 毫秒数对。
// upper 缺失表示开放上限(diff > lower)。解析失败返回 null,跳过该规则。
function colorRuleRange(rangeKey: string): { lo: number; hi: number | null } | null {
  const idx = rangeKey.indexOf("~");
  if (idx < 0) return null;
  const lo = nowOffsetToMs(rangeKey.slice(0, idx).trim());
  if (lo === null) return null;
  const hiPart = rangeKey.slice(idx + 1).trim();
  if (hiPart === "") return { lo, hi: null };
  const hi = nowOffsetToMs(hiPart);
  if (hi === null) return null;
  return { lo, hi };
}

// 在 color_rules 中查找差值落到的区间,返回对应颜色。
// 规则按 lo 升序遍历,首个命中即返回。
// 颜色规则的 lower / upper 都带 + 号(例如 "now+30s~now+1m")表示"未来某段时间",
// 因此用**带符号的** diffMs 匹配:已过期(负差)不会被强匹配成"很大"而命中。
// 不在任何区间内时返回 undefined,即不染色。
function matchColorRule(
  diffMs: number,
  rules: Record<string, string> | undefined,
): string | undefined {
  if (!rules) return undefined;
  const parsed: { lo: number; hi: number | null; color: string }[] = [];
  for (const [key, color] of Object.entries(rules)) {
    const r = colorRuleRange(key);
    if (r) parsed.push({ ...r, color });
  }
  parsed.sort((a, b) => a.lo - b.lo);
  for (const r of parsed) {
    if (diffMs > r.lo && (r.hi === null || diffMs <= r.hi)) return r.color;
  }
  return undefined;
}

// 反向查找:给定筛选单值 "now+30s",找 color_rules 中以它为下界的那一档。
// 用于在 select 选项前加 ● 标识,告诉用户"选这一档有颜色规则"。
function findColorForFilter(
  filterValue: string,
  rules: Record<string, string> | undefined,
): string | undefined {
  if (!rules) return undefined;
  for (const [key, color] of Object.entries(rules)) {
    const idx = key.indexOf("~");
    const lower = (idx < 0 ? key : key.slice(0, idx)).trim();
    if (lower === filterValue) return color;
  }
  return undefined;
}

function runtimeStorageKey(slug: string, suffix: string): string {
  // slug 可能含特殊字符,做一次转义避免破坏 localStorage key。
  return `${RUNTIME_STORAGE_PREFIX}${slug.replace(/[^A-Za-z0-9_-]/g, "_")}:${suffix}`;
}

function loadSortEntries(slug: string): SortEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(runtimeStorageKey(slug, "sort"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SortEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.field === "string" &&
        (item.order === "asc" || item.order === "desc")
      ) {
        out.push({ field: item.field, order: item.order });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveSortEntries(slug: string, entries: SortEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(runtimeStorageKey(slug, "sort"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "sort"),
        JSON.stringify(entries),
      );
    }
  } catch {
    // 容量满 / 隐私模式 / 被禁用 —— 静默,不影响界面交互
  }
}

function loadFilters(slug: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(runtimeStorageKey(slug, "filters"));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveFilters(slug: string, filters: Record<string, string>): void {
  if (typeof window === "undefined") return;
  // 只持久化有非空值的列,空 map 主动 removeItem 避免 key 残留。
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === "string" && v !== "") cleaned[k] = v;
  }
  try {
    if (Object.keys(cleaned).length === 0) {
      window.localStorage.removeItem(runtimeStorageKey(slug, "filters"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "filters"),
        JSON.stringify(cleaned),
      );
    }
  } catch {
    // 静默
  }
}

function loadOffset(slug: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(runtimeStorageKey(slug, "offset"));
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function saveOffset(slug: string, offset: number): void {
  if (typeof window === "undefined") return;
  try {
    if (offset === 0) {
      window.localStorage.removeItem(runtimeStorageKey(slug, "offset"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "offset"),
        String(offset),
      );
    }
  } catch {
    // 静默
  }
}

function loadLimit(slug: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(runtimeStorageKey(slug, "limit"));
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function saveLimit(slug: string, limit: number): void {
  if (typeof window === "undefined") return;
  try {
    if (limit === PAGE_SIZE_DEFAULT) {
      // 还原默认值时清掉残留,方便后续默认值变更时迁移。
      window.localStorage.removeItem(runtimeStorageKey(slug, "limit"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "limit"),
        String(limit),
      );
    }
  } catch {
    // 静默
  }
}

function loadAutoRefreshEnabled(slug: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(
      runtimeStorageKey(slug, "auto-enabled"),
    );
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function saveAutoRefreshEnabled(slug: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (!enabled) {
      // 关闭态用 removeItem 占位,避免 key 残留太多。
      window.localStorage.removeItem(runtimeStorageKey(slug, "auto-enabled"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "auto-enabled"),
        "true",
      );
    }
  } catch {
    // 静默
  }
}

function loadAutoRefreshSeconds(slug: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(
      runtimeStorageKey(slug, "auto-seconds"),
    );
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function saveAutoRefreshSeconds(slug: string, seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    if (seconds === 30) {
      // 默认值清理:同 limit 的策略
      window.localStorage.removeItem(runtimeStorageKey(slug, "auto-seconds"));
    } else {
      window.localStorage.setItem(
        runtimeStorageKey(slug, "auto-seconds"),
        String(seconds),
      );
    }
  } catch {
    // 静默
  }
}

interface ModelRuntimeProps {
  slug: string;
  onBack?: () => void;
  onEdit?: () => void;
  onDeleted: () => void;
  hideHeader?: boolean;
  // When true, the runtime only allows viewing: no insert/update/delete
  // buttons are rendered and the model cannot be deleted. Used for
  // system-managed tables (logic_models, pages) whose schema is owned
  // by the application itself.
  readOnly?: boolean;
}

type SortEntry = { field: string; order: "asc" | "desc" };

const PAGE_SIZE_DEFAULT = 50;

export function ModelRuntime({
  slug,
  onBack,
  onEdit,
  onDeleted,
  hideHeader = false,
  readOnly = false,
}: ModelRuntimeProps) {
  const [schema, setSchema] = useState<RuntimeSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{
    items: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
    fields: RuntimeField[];
  } | null>(null);
  // 颜色规则诊断:rows 拉取后统计各字段的差值范围与匹配率,
  // 表格下方渲染,告诉用户「配置区间 vs 实际差值」是否对得上。
  const [colorRulesStats, setColorRulesStats] = useState<{
    field: string;
    total: number;
    matched: number;
    minDiffMs: number;
    maxDiffMs: number;
  }[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(() =>
    loadFilters(slug),
  );
  // 多字段排序:每条 {field, order};按列表先后顺序拼接 ORDER BY。
  // 点击列头的循环:未排 -> 加 desc -> 切 asc -> 移除(回到无序)。
  // 持久化到 localStorage,按 slug 分组,刷新后保留用户选择的排序。
  const [sortEntries, setSortEntries] = useState<SortEntry[]>(() =>
    loadSortEntries(slug),
  );
  const [offset, setOffset] = useState<number>(() => loadOffset(slug, 0));
  const [limit, setLimit] = useState<number>(() =>
    loadLimit(slug, PAGE_SIZE_DEFAULT),
  );
  const [loading, setLoading] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [detail, setDetail] = useState<{ pk: string; row: Record<string, unknown> } | null>(null);
  const [detailData, setDetailData] = useState<{
    row: Record<string, unknown>;
    relations: ExpandedRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<{ pk: string; row: Record<string, unknown> } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // 二维码弹窗打开期间冻结自动刷新,避免 setRows 重新渲染导致弹窗被关掉。
  const [qrcodeModalOpen, setQrcodeModalOpen] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() =>
    loadAutoRefreshEnabled(slug, false),
  );
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState<number>(() =>
    loadAutoRefreshSeconds(slug, 30),
  );
  const [autoRefreshInput, setAutoRefreshInput] = useState("30");
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(0);
  const autoRefreshTickRef = useRef<number | null>(null);

  const refreshSchema = useCallback(async () => {
    setError(null);
    try {
      const s = await getRuntimeSchema(slug);
      setSchema(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载配置失败");
    }
  }, [slug]);

  const refreshRows = useCallback(async () => {
    if (!schema) return;
    setLoading(true);
    setError(null);
    try {
      const cleanFilters: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v.trim()) cleanFilters[k] = v.trim();
      }
      const r = await listRuntimeRows(slug, {
        limit: limit,
        offset,
        sort: sortEntries.length > 0 ? sortEntries.map((e) => e.field).join(",") : undefined,
        order: sortEntries.length > 0 ? sortEntries.map((e) => e.order).join(",") : undefined,
        filters: cleanFilters,
      });
      setRows({
        items: r.rows,
        total: r.total,
        limit: r.limit,
        offset: r.offset,
        fields: r.fields,
      });
      // rows 拉取后,扫一遍配了 color_rules 的字段,统计差值范围与匹配率。
      // 用户常误配区间(如数据差 7 小时但配 30s~5m),这里直接给数字提示。
      const stats: {
        field: string;
        total: number;
        matched: number;
        minDiffMs: number;
        maxDiffMs: number;
      }[] = [];
      for (const f of r.fields) {
        if (!f.color_rules || Object.keys(f.color_rules).length === 0) continue;
        let total = 0;
        let matched = 0;
        // 范围用带符号差(过去为负、未来为正),用户配的 color_rules 是"未来 N 秒"语义,
        // 范围信息能看出实际数据多在「过去」还是「未来」。
        let minDiff = Infinity;
        let maxDiff = -Infinity;
        const now = Date.now();
        for (const row of r.rows) {
          const target = parseDateLike(row[f.physical]);
          if (target === null) continue;
          total++;
          const diff = target - now;
          if (diff < minDiff) minDiff = diff;
          if (diff > maxDiff) maxDiff = diff;
          if (matchColorRule(diff, f.color_rules)) matched++;
        }
        if (total > 0) {
          stats.push({
            field: f.physical,
            total,
            matched,
            minDiffMs: minDiff,
            maxDiffMs: maxDiff,
          });
        }
      }
      setColorRulesStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [schema, slug, offset, sortEntries, limit, filters]);

  useEffect(() => {
    void refreshSchema();
  }, [refreshSchema]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  // 排序状态持久化:slug 切换时重读,sortEntries 变化时写回。
  useEffect(() => {
    setSortEntries(loadSortEntries(slug));
  }, [slug]);

  useEffect(() => {
    saveSortEntries(slug, sortEntries);
  }, [slug, sortEntries]);

  // filters / offset / limit 同样按 slug 持久化。
  useEffect(() => {
    setFilters(loadFilters(slug));
  }, [slug]);

  useEffect(() => {
    saveFilters(slug, filters);
  }, [slug, filters]);

  useEffect(() => {
    setOffset(loadOffset(slug, 0));
  }, [slug]);

  useEffect(() => {
    saveOffset(slug, offset);
  }, [slug, offset]);

  useEffect(() => {
    setLimit(loadLimit(slug, PAGE_SIZE_DEFAULT));
  }, [slug]);

  useEffect(() => {
    saveLimit(slug, limit);
  }, [slug, limit]);

  // 自动刷新配置按 slug 持久化(enabled / seconds),input 跟随 seconds。
  useEffect(() => {
    setAutoRefreshEnabled(loadAutoRefreshEnabled(slug, false));
    setAutoRefreshSeconds(loadAutoRefreshSeconds(slug, 30));
    setAutoRefreshInput(String(loadAutoRefreshSeconds(slug, 30)));
  }, [slug]);

  useEffect(() => {
    saveAutoRefreshEnabled(slug, autoRefreshEnabled);
  }, [slug, autoRefreshEnabled]);

  useEffect(() => {
    saveAutoRefreshSeconds(slug, autoRefreshSeconds);
  }, [slug, autoRefreshSeconds]);

  useEffect(() => {
    if (
      !autoRefreshEnabled ||
      !schema ||
      autoRefreshSeconds <= 0 ||
      qrcodeModalOpen
    ) {
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
          void refreshRows();
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
  }, [autoRefreshEnabled, autoRefreshSeconds, schema, refreshRows, qrcodeModalOpen]);

  const openDetail = async (pk: string) => {
    setDetail({ pk, row: {} });
    setDetailLoading(true);
    try {
      const d = await getRuntimeRow(slug, pk);
      setDetailData({ row: d.row, relations: d.relations });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载详情失败");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const onDelete = async (pk: string) => {
    if (!confirm("确定要删除该记录吗?")) return;
    try {
      await deleteRuntimeRow(slug, pk);
      toast.success("已删除");
      if (rows && rows.items.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - limit));
      } else {
        await refreshRows();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleDeleteModel = async () => {
    if (!schema) return;
    if (!confirm(`确定删除逻辑模型 "${schema.label}" 吗?数据库表不会被删除。`)) return;
    try {
      await deleteModel(slug);
      toast.success("已删除模型");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  if (!schema) {
    return (
      <div className="space-y-2 rounded-lg border p-6 text-sm">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : (
          <p className="text-muted-foreground">加载中…</p>
        )}
      </div>
    );
  }

  const rootTable = schema.tables.find((t) => t.alias === schema.root_alias);
  if (!rootTable) {
    return (
      <div className="space-y-3 rounded-lg border p-6 text-sm">
        <p className="text-destructive">根表配置缺失,请重新编辑模型</p>
        <Button size="sm" variant="outline" onClick={onEdit}>
          编辑模型
        </Button>
      </div>
    );
  }

  // Prefer the runtime-computed fields (which include any JOINed relation columns).
  // Fall back to root table fields if rows haven't loaded yet.
  const visibleFields =
    rows && rows.fields && rows.fields.length > 0
      ? rows.fields.filter((f) => f.list_show)
      : rootTable.fields.filter(
          (f) => f.list_show || rootTable.primary_key === f.physical,
        );

  const pkName = rootTable.primary_key;
  const total = rows?.total ?? 0;
  const pageStart = total === 0 ? 0 : (rows?.offset ?? 0) + 1;
  const pageEnd = Math.min((rows?.offset ?? 0) + limit, total);
  const totalPages = total === 0 ? 0 : Math.max(1, Math.ceil(total / limit));
  const currentPage = total === 0 ? 0 : Math.floor((rows?.offset ?? 0) / limit) + 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      {!hideHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="返回">
                <ArrowLeft className="size-3.5" />
              </Button>
            ) : null}
            <h2 className="text-base font-medium">{schema.label}</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {schema.slug}
            </span>
            <span className="text-xs text-muted-foreground">
              · {total} 行
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onEdit ? (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="size-3.5" />
                {readOnly ? "编辑视图" : "编辑模型"}
              </Button>
            ) : null}
            {readOnly ? null : (
              <Button size="sm" variant="ghost" onClick={() => void handleDeleteModel()}>
                <Trash2 className="size-3.5 text-destructive" />
                删除模型
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {!hideHeader && schema.description ? (
        <p className="text-xs text-muted-foreground">{schema.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const active = Object.values(filters).filter((v) => v.trim()).length;
            const sortActive = sortEntries.length;
            const total = active + sortActive;
            return total > 0 ? (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/80">
                已选 {total} 个{active > 0 && sortActive > 0 ? " (含排序)" : ""}
              </span>
            ) : null;
          })()}
          {Object.values(filters).some((v) => v) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilters({});
                setOffset(0);
              }}
            >
              清空筛选
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void refreshRows()}>
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
              disabled={!schema}
            />
            <span className="text-[10px] text-muted-foreground">秒</span>
            <Button
              size="sm"
              variant={autoRefreshEnabled ? "default" : "outline"}
              onClick={() => setAutoRefreshEnabled((v) => !v)}
              aria-label={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
              title={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
              disabled={!schema}
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
        {readOnly ? null : (
          <Button size="sm" onClick={() => setInsertOpen(true)}>
            <Plus className="size-3.5" />
            新增记录
          </Button>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {visibleFields.map((f) => {
                const sortIndex = sortEntries.findIndex((e) => e.field === f.physical);
                const isSorted = sortIndex >= 0;
                const order = isSorted ? sortEntries[sortIndex].order : null;
                return (
                  <th
                    key={f.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSortEntries((prev) => {
                        const idx = prev.findIndex((e) => e.field === f.physical);
                        if (idx < 0) {
                          // 未排 -> 加入(默认 desc)
                          return [...prev, { field: f.physical, order: "desc" }];
                        }
                        if (prev[idx].order === "desc") {
                          // desc -> asc,保留位置
                          const next = prev.slice();
                          next[idx] = { field: f.physical, order: "asc" };
                          return next;
                        }
                        // asc -> 移除(回到无序),其它列的相对顺序不变
                        return prev.filter((_, i) => i !== idx);
                      });
                      setOffset(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).click();
                      }
                    }}
                    className="sticky top-0 z-10 cursor-pointer select-none border-b bg-muted/60 px-3 py-2 text-left font-medium hover:bg-muted"
                  >
                    <div className="flex items-center gap-1">
                      <span>{f.label}</span>
                      <span className="font-mono text-[10px]">
                        [{f.business_type}]
                      </span>
                      {isSorted ? (
                        <span
                          aria-hidden
                          className="inline-flex items-center gap-0.5 text-foreground/80"
                          title={`排序 #${sortIndex + 1} (${order})`}
                        >
                          <span className="rounded bg-foreground/10 px-1 text-[10px] tabular-nums">
                            {sortIndex + 1}
                          </span>
                          <span>{order === "asc" ? "▲" : "▼"}</span>
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="text-foreground/30 transition-opacity"
                        >
                          ↕
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              {readOnly ? null : (
                <th className="border-b px-3 py-2 text-right font-medium">操作</th>
              )}
            </tr>
            <tr>
              {visibleFields.map((f) => (
                <th
                  key={`f-${f.key}`}
                  className="border-b bg-muted/60 px-2 py-1.5 font-normal"
                >
                  {f.business_type === "boolean" ? (
                    <select
                      value={filters[f.physical] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (v) next[f.physical] = v;
                          else delete next[f.physical];
                          return next;
                        });
                        setOffset(0);
                      }}
                      className="h-6 w-full rounded border bg-background px-1 text-[10px]"
                    >
                      <option value="">全部</option>
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  ) : f.business_type === "select" ||
                    f.business_type === "multiselect" ? (
                    <select
                      value={filters[f.physical] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (v) next[f.physical] = v;
                          else delete next[f.physical];
                          return next;
                        });
                        setOffset(0);
                      }}
                      className="h-6 w-full rounded border bg-background px-1 text-[10px]"
                    >
                      <option value="">全部</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.business_type === "date" ||
                    f.business_type === "datetime" ||
                    f.business_type === "countdown" ? (
                    <DateFilterSelect
                      value={filters[f.physical] ?? ""}
                      colorRules={f.color_rules}
                      onChange={(v) => {
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (v) next[f.physical] = v;
                          else delete next[f.physical];
                          return next;
                        });
                        setOffset(0);
                      }}
                    />
                  ) : (
                    <Input
                      type={
                        f.business_type === "number" ||
                        f.business_type === "integer"
                          ? "number"
                          : "text"
                      }
                      placeholder="筛选"
                      value={filters[f.physical] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (v) next[f.physical] = v;
                          else delete next[f.physical];
                          return next;
                        });
                        setOffset(0);
                      }}
                      className="h-6 w-full px-1.5 text-[10px]"
                    />
                  )}
                </th>
              ))}
              {readOnly ? null : <th className="border-b bg-muted/60" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleFields.length + (readOnly ? 0 : 1)}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  加载中…
                </td>
              </tr>
            ) : !rows || rows.items.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleFields.length + (readOnly ? 0 : 1)}
                  className="px-3 py-10 text-center text-xs text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>没有数据</span>
                    {Object.keys(filters).length > 0 || sortEntries.length > 0 ? (
                      <span className="text-[10px]">
                        当前筛选 / 排序条件下无匹配记录,可点击「清空筛选」重置
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              rows.items.map((r, idx) => {
                const pk = String(r[pkName] ?? r.__pk ?? "");
                // 本轮渲染基准时间,用于按差值匹配颜色规则。
                // 颜色随 refreshRows 重新计算,不必逐秒更新,避免每帧重渲表格。
                const nowMs = Date.now();
                return (
                  <tr
                    key={idx}
                    className="cursor-pointer odd:bg-muted/20 hover:bg-muted/40"
                    onClick={() => void openDetail(pk)}
                  >
                    {visibleFields.map((f) => {
                      // 按行实际差值匹配 color_rules 区间,与筛选解耦:
                      // 筛选只看 "> now+Ns",染色按"差值落在哪一档"决定颜色。
                      const target = parseDateLike(r[f.physical]);
                      const cellColor =
                        target !== null && f.color_rules
                          ? matchColorRule(target - nowMs, f.color_rules)
                          : undefined;
                      return (
                      <td
                        key={f.key}
                        className="max-w-[260px] truncate border-b px-3 py-1.5 align-top text-xs"
                        style={cellColor ? { backgroundColor: cellColor } : undefined}
                      >
                        <CellValue
                          value={r[f.physical]}
                          field={f}
                          onPreviewImage={setPreviewImage}
                          onQrcodeOpenChange={setQrcodeModalOpen}
                        />
                      </td>
                      );
                    })}
                    <td className="border-b px-3 py-1.5 text-right">
                      {readOnly ? null : (
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="编辑"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing({ pk, row: r });
                            }}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDelete(pk);
                            }}
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="space-y-0.5">
          <div>
            {total === 0
              ? "共 0 行"
              : `${pageStart} - ${pageEnd} / 共 ${total} 行`}
          </div>
          {colorRulesStats.length > 0 ? (
            <div className="text-[10px]">
              {colorRulesStats.map((s) => {
                const lo = formatOffsetMs(s.minDiffMs);
                const hi = formatOffsetMs(s.maxDiffMs);
                return (
                  <div key={s.field}>
                    颜色规则 <code className="font-mono">{s.field}</code>:
                    实际差值 <code className="font-mono">{lo} ~ {hi}</code>,
                    匹配 {s.matched}/{s.total} 行
                    {s.matched === 0
                      ? " —— 请检查 color_rules 区间是否覆盖实际差值"
                      : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-1">
          <select
            value={String(limit)}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
            className="h-7 rounded-md border bg-transparent px-2 text-xs"
            aria-label="每页条数"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/页
              </option>
            ))}
          </select>
          <span className="mx-1 text-[10px]">
            第 {currentPage} / {totalPages} 页
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={(rows?.offset ?? 0) === 0}
            onClick={() => setOffset(Math.max(0, (rows?.offset ?? 0) - limit))}
            aria-label="上一页"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={(rows?.offset ?? 0) + limit >= total}
            onClick={() => setOffset((rows?.offset ?? 0) + limit)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <RowFormDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        schema={schema}
        mode="insert"
        onSubmit={async (input) => {
          await createRuntimeRow(slug, input);
          setInsertOpen(false);
          if (offset !== 0) setOffset(0);
          else await refreshRows();
          toast.success("已新增");
        }}
      />

      <RowFormDialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        schema={schema}
        mode="update"
        initial={editing?.row}
        pkValue={editing?.pk}
        onSubmit={async (input) => {
          if (!editing) return;
          await updateRuntimeRow(slug, editing.pk, input);
          setEditing(null);
          await refreshRows();
          toast.success("已保存");
        }}
      />

      <RowDetailDialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) {
            setDetail(null);
            setDetailData(null);
          }
        }}
        loading={detailLoading}
        data={detailData}
        schema={schema}
        readOnly={readOnly}
        onEditFromDetail={() => {
          if (!detail || !detailData) return;
          setEditing({ pk: detail.pk, row: detailData.row });
          setDetail(null);
          setDetailData(null);
        }}
      />

      <ImagePreviewDialog
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
}

interface CellValueProps {
  value: unknown;
  field: RuntimeField;
  onPreviewImage?: (src: string) => void;
  onQrcodeOpenChange?: (open: boolean) => void;
}

function CellValue({
  value,
  field,
  onPreviewImage,
  onQrcodeOpenChange,
}: CellValueProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (field.business_type) {
    case "image":
      return (
        <button
          type="button"
          className="block"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewImage?.(String(value));
          }}
        >
          <img
            src={absoluteUrl(String(value))}
            alt=""
            className="h-10 w-10 rounded border object-cover"
            loading="lazy"
          />
        </button>
      );
    case "file":
      return (
        <a
          href={absoluteUrl(String(value))}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="break-all text-[10px] text-foreground underline-offset-2 hover:underline"
        >
          {String(value)}
        </a>
      );
    case "boolean":
      return value ? "✓" : "✗";
    case "select": {
      const lbl = optionLabel(field.options, value);
      return <span>{lbl ?? String(value)}</span>;
    }
    case "multiselect": {
      const labels = optionLabels(field.options, parseStoredList(value));
      return (
        <span className="inline-flex flex-wrap gap-1">
          {labels.map((l, i) => (
            <span
              key={i}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
            >
              {l}
            </span>
          ))}
        </span>
      );
    }
    case "images":
    case "json":
      return <span className="font-mono text-[10px]">{summarize(value)}</span>;
    case "cron":
      return <CronCell value={String(value)} />;
    case "datetime":
      return <span>{formatDateTimeForDisplay(value)}</span>;
    case "date":
      return <span>{formatDateForDisplay(value)}</span>;
    case "countdown":
      return <CountdownCell target={parseDateLike(value)} />;
    case "qrcode":
      return <QrcodeCell value={value} onOpenChange={onQrcodeOpenChange} />;
    default:
      return <span>{formatDisplayText(summarize(value))}</span>;
  }
}

function formatDateTimeForDisplay(v: unknown): string {
  if (v === null || v === undefined) return "";
  // 历史数据可能是 "YYYY-MM-DDTHH:MM" / "YYYY-MM-DDTHH:MM:SS";统一展示成空格分隔。
  return String(v).replace("T", " ");
}

function formatDateForDisplay(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toDateTimeLocalInput(raw: string): string {
  // 把 "YYYY-MM-DD HH:MM[:SS]" / "YYYY-MM-DDTHH:MM[:SS]" 统一成 datetime-local 期望的 "YYYY-MM-DDTHH:MM"。
  const s = raw.replace("T", " ").trim();
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(s);
  if (!m) return "";
  return `${m[1]}T${m[2]}`;
}

// parseDateLike 把 "YYYY-MM-DD HH:MM[:SS]" / "YYYY-MM-DDTHH:MM[:SS]" / "YYYY-MM-DD"
// 解析为时间戳;无法解析返回 null。后端存的是本地时间字面值,所以按本地时区构造。
function parseDateLike(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace("T", " ").trim();
  if (!s) return null;
  // 仅有 YYYY-MM-DD 时补午夜
  const padded = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s} 00:00:00` : s;
  // 缺秒位补 ":00",以便 Date 能稳定解析。
  const withSec = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(padded) ? `${padded}:00` : padded;
  const ms = Date.parse(withSec);
  return Number.isNaN(ms) ? null : ms;
}

// formatCountdown 把毫秒差值格式化为人类可读的相对时间描述。
// 正值 = 未来(还没开始),负值 = 过去(已过期)。
function formatCountdown(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const future = diffMs >= 0;
  const sec = Math.floor(abs / 1000);
  if (sec < 60) {
    return future ? `${sec} 秒` : `已过 ${sec} 秒`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const remSec = sec % 60;
    return future
      ? remSec > 0
        ? `${min} 分 ${remSec} 秒`
        : `${min} 分钟`
      : `已过 ${min} 分 ${remSec} 秒`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const remMin = min % 60;
    return future
      ? remMin > 0
        ? `${hr} 小时 ${remMin} 分`
        : `${hr} 小时`
      : `已过 ${hr} 小时 ${remMin} 分`;
  }
  const day = Math.floor(hr / 24);
  const remHr = hr % 24;
  return future
    ? remHr > 0
      ? `${day} 天 ${remHr} 小时`
      : `${day} 天`
    : `已过 ${day} 天 ${remHr} 小时`;
}

interface CountdownCellProps {
  target: number | null;
}

// CountdownCell 每秒重新计算与当前时间的差值,使倒计时看起来在「走动」。
function CountdownCell({ target }: CountdownCellProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (target === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-mono text-[11px]">{formatCountdown(target - now)}</span>;
}

interface DateFilterSelectProps {
  value: string;
  colorRules: Record<string, string> | undefined;
  onChange: (value: string) => void;
}

// 自绘下拉:原生 <option> 不支持自定义颜色,改用 popover + 真实色块。
// 当前选中的值对应 color_rules 区间时,在按钮右侧加一个色块,直观看到颜色。
function DateFilterSelect({
  value,
  colorRules,
  onChange,
}: DateFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  const current = DATE_FILTER_PRESETS.find((p) => p.value === value);
  const currentColor = current
    ? findColorForFilter(current.value, colorRules)
    : undefined;
  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-full items-center gap-1 rounded border bg-background px-1 text-[10px]"
      >
        {currentColor ? (
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border"
            style={{ backgroundColor: currentColor }}
          />
        ) : null}
        <span className="flex-1 truncate text-left">
          {current ? current.label : "全部"}
        </span>
        <span aria-hidden className="text-muted-foreground">▾</span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border bg-card p-1 text-[11px] shadow-md"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted"
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0" />
            <span>全部</span>
          </button>
          {DATE_FILTER_PRESETS.map((p) => {
            const c = findColorForFilter(p.value, colorRules);
            return (
              <button
                key={p.value}
                type="button"
                role="option"
                aria-selected={value === p.value}
                onClick={() => {
                  onChange(p.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted"
              >
                {c ? (
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border"
                    style={{ backgroundColor: c }}
                  />
                ) : (
                  <span className="inline-block h-2.5 w-2.5 shrink-0" />
                )}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface QrcodeCellProps {
  value: unknown;
  // 弹窗打开/关闭时通知父组件,父组件可借此暂停自动刷新等副作用。
  onOpenChange?: (open: boolean) => void;
}

// QrcodeCell 把字符串渲染成二维码 SVG,字符串为空时显示占位符;
// 默认走纯 SVG 路径,避免对 canvas/node-canvas 的依赖。
function QrcodeCell({ value, onOpenChange }: QrcodeCellProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const text = value === null || value === undefined ? "" : String(value).trim();

  // 弹窗状态变化时同步给父组件,父组件据此暂停自动刷新,
  // 避免 setRows 重新渲染导致弹窗被卸载、扫描中突然关闭。
  useEffect(() => {
    onOpenChange?.(open);
    if (!open) return;
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  useEffect(() => {
    let cancelled = false;
    if (!text) {
      setSvg(null);
      return;
    }
    import("qrcode").then((mod) => {
      const QR = mod.default ?? mod;
      QR.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" })
        .then((s) => {
          if (!cancelled) setSvg(s);
        })
        .catch(() => {
          if (!cancelled) setSvg(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!svg) {
    return <span className="font-mono text-[10px] text-muted-foreground">{summarize(text)}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="block"
        title="点击查看二维码"
      >
        <span
          aria-hidden
          className="block h-10 w-10 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            // 阻止冒泡到 <tr>:点击遮罩关闭二维码时不应触发行级"记录详情"。
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="rounded-lg bg-background p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-[80vw] [&_svg]:h-auto [&_svg]:max-h-[70vh] [&_svg]:w-[min(70vh,80vw)]">
              <span aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
            <p className="mt-3 break-all text-center text-[10px] text-muted-foreground">
              {text}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function summarize(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

// formatDisplayText 在 default 分支里对"长得像数字"的字符串做轻量格式化:
// SQLite 存数字时往往带无意义的 .0 尾零(如 "66.0"),按数字展示更易读;
// 非纯数字串(URL、邮箱等)原样返回,不受影响。
function formatDisplayText(s: string): string {
  const trimmed = s.trim();
  if (trimmed === "") return s;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

function defaultHint(field: RuntimeField): string | undefined {
  const d = field.default;
  if (!d) return undefined;
  if (d === "now") return "留空将自动填充当前时间";
  return `默认：${d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function nowAsDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowAsDateTimeLocalString(): string {
  const d = new Date();
  return `${nowAsDateString()}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function optionLabel(options: SelectOption[] | undefined, value: unknown): string | null {
  if (!options || value === null || value === undefined) return null;
  const v = String(value);
  const hit = options.find((o) => o.value === v);
  return hit ? hit.label : null;
}

function optionLabels(options: SelectOption[] | undefined, values: unknown[]): string[] {
  if (!options) return [];
  const out: string[] = [];
  for (const v of values) {
    const lbl = optionLabel(options, v);
    out.push(lbl ?? String(v));
  }
  return out;
}

function parseStoredList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      return v ? [v] : [];
    }
  }
  return [];
}

interface RowDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  data: { row: Record<string, unknown>; relations: ExpandedRow[] } | null;
  schema: RuntimeSchema;
  onEditFromDetail: () => void;
  readOnly?: boolean;
}

function RowDetailDialog({
  open,
  onOpenChange,
  loading,
  data,
  schema,
  onEditFromDetail,
  readOnly,
}: RowDetailDialogProps) {
  const rootTable = schema.tables.find((t) => t.alias === schema.root_alias);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  if (!rootTable) return null;
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="记录详情"
        description={schema.label}
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            {readOnly ? null : (
              <Button type="button" onClick={onEditFromDetail} disabled={!data}>
                <Pencil className="size-3.5" />
                编辑
              </Button>
            )}
          </>
        }
      >
        {loading || !data ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "加载中…"}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {rootTable.fields.map((f) => (
                <DetailField
                  key={f.key}
                  field={f}
                  value={data.row[f.physical]}
                  onPreview={setPreviewImage}
                />
              ))}
            </div>
            {data.relations.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">关联数据</div>
                  {data.relations.map((rel) => (
                    <RelationBlock key={rel.id} relation={rel} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </Dialog>
      <ImagePreviewDialog src={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
}

function DetailField({
  field,
  value,
  onPreview,
}: {
  field: RuntimeField;
  value: unknown;
  onPreview?: (src: string) => void;
}) {
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{field.label}</span>
        <span className="font-mono text-[10px]">[{field.business_type}]</span>
      </div>
      <div className="break-words text-sm">
        {field.business_type === "image" || field.business_type === "file" ? (
          <DetailMedia
            value={value}
            type={field.business_type}
            onPreview={onPreview}
          />
        ) : field.business_type === "select" ? (
          <DetailSelectValue value={value} options={field.options} />
        ) : field.business_type === "multiselect" ? (
          <DetailMultiSelectValue value={value} options={field.options} />
        ) : field.business_type === "cron" ? (
          <DetailCronValue value={value} />
        ) : (
          <DetailValue value={value} />
        )}
      </div>
    </div>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "object") {
    return (
      <pre className="overflow-auto rounded bg-muted/40 p-2 text-[11px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span>{formatDisplayText(String(value))}</span>;
}

function DetailSelectValue({
  value,
  options,
}: {
  value: unknown;
  options?: SelectOption[];
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  const lbl = optionLabel(options, value);
  if (lbl) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{lbl}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          ({String(value)})
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{String(value)}</span>
      <span className="text-[10px] text-amber-600">未匹配选项</span>
    </span>
  );
}

function DetailMultiSelectValue({
  value,
  options,
}: {
  value: unknown;
  options?: SelectOption[];
}) {
  const list = parseStoredList(value);
  if (list.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const labels = optionLabels(options, list);
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l, i) => {
        const matched = options?.some((o) => o.label === l && o.value === list[i]);
        return (
          <span
            key={i}
            className={
              matched
                ? "rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                : "rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            }
            title={list[i]}
          >
            {l}
          </span>
        );
      })}
    </div>
  );
}

function DetailCronValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  const expr = String(value);
  return (
    <div className="flex flex-col gap-1.5">
      <CronCell value={expr} stopRowClick={false} />
      <span className="font-mono text-[10px] text-muted-foreground">{expr}</span>
    </div>
  );
}

interface ImagePreviewDialogProps {
  src: string | null;
  onClose: () => void;
}

function ImagePreviewDialog({ src, onClose }: ImagePreviewDialogProps) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;
  const url = absoluteUrl(src);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
      >
        关闭
      </button>
    </div>
  );
}

function DetailMedia({
  value,
  type,
  onPreview,
}: {
  value: unknown;
  type: "image" | "file";
  onPreview?: (src: string) => void;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const url = String(value);
  if (type === "image") {
    return (
      <button
        type="button"
        onClick={() => onPreview?.(url)}
        className="block"
      >
        <img
          src={absoluteUrl(url)}
          alt=""
          className="max-h-32 rounded border bg-muted"
          loading="lazy"
        />
      </button>
    );
  }
  return (
    <a
      className="text-xs underline-offset-2 hover:underline"
      href={absoluteUrl(url)}
      target="_blank"
      rel="noreferrer"
    >
      {url}
    </a>
  );
}

function RelationBlock({ relation }: { relation: ExpandedRow }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{relation.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {relation.type}
        </span>
      </div>
      {relation.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">无关联数据</p>
      ) : (
        <ul className="space-y-1">
          {relation.rows.map((row, idx) => (
            <li
              key={idx}
              className="rounded border bg-muted/20 px-2 py-1 text-xs"
            >
              <RelatedRowSummary row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RelatedRowSummary({ row }: { row: Record<string, unknown> }) {
  const entries = Object.entries(row).slice(0, 6);
  return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {entries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{k}:</span>
            <span className="font-mono text-[11px]">{summarize(v)}</span>
          </span>
        ))}
      </div>
  );
}

interface RowFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schema: RuntimeSchema;
  mode: "insert" | "update";
  initial?: Record<string, unknown>;
  pkValue?: string;
  onSubmit: (input: RowMutationInput) => Promise<void>;
}

function RowFormDialog({
  open,
  onOpenChange,
  schema,
  mode,
  initial,
  pkValue,
  onSubmit,
}: RowFormDialogProps) {
  const rootTable = schema.tables.find((t) => t.alias === schema.root_alias);
  const fields = useMemo<RuntimeField[]>(
    () => {
      const all = rootTable?.fields ?? [];
      // 新增时主键由数据库自增,不需要也不允许用户填写;编辑时主键也不可改。
      if (mode === "insert" || mode === "update") {
        const pk = rootTable?.primary_key;
        if (pk) {
          return all.filter((f) => f.physical !== pk);
        }
      }
      return all;
    },
    [rootTable, mode],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [m2m, setM2m] = useState<Record<string, number[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    const drafts: Record<string, string> = {};
    for (const f of fields) {
      const v = initial?.[f.physical];
      if (v === null || v === undefined) {
        // 插入时,如果字段配置了 default === "now" 且未提供值,
        // 用打开弹窗那一刻的当前时间作为默认值,前端先于后端兜底填上,
        // 让用户能立刻看到「时间」字段被自动填充了。
        if (mode === "insert" && f.default === "now") {
          if (f.business_type === "datetime") {
            seed[f.key] = nowAsDateTimeLocalString();
          } else if (f.business_type === "date") {
            seed[f.key] = nowAsDateString();
          } else {
            seed[f.key] = "";
          }
        } else {
          seed[f.key] = "";
        }
      } else if (typeof v === "object") {
        seed[f.key] = JSON.stringify(v);
        drafts[f.key] = JSON.stringify(v, null, 2);
      } else if (typeof v === "boolean") {
        seed[f.key] = v ? "true" : "false";
      } else if (f.business_type === "json") {
        const raw = String(v);
        seed[f.key] = raw;
        const pretty = formatJsonOrNull(raw) ?? raw;
        drafts[f.key] = pretty;
      } else if (f.business_type === "datetime" || f.business_type === "countdown") {
        // 后端存的可能是 "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM[:SS]" 任一种;
        // datetime-local 只接受 "YYYY-MM-DDTHH:MM"。
        seed[f.key] = toDateTimeLocalInput(String(v));
      } else {
        seed[f.key] = String(v);
      }
    }
    setValues(seed);
    setJsonDrafts(drafts);
    setM2m({});
    setError(null);
  }, [open, fields, initial, mode]);

  if (!rootTable) return null;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        if (mode === "update" && !f.editable) continue;
        const raw = values[f.key];
        if (raw === "" || raw === undefined) {
          if (mode === "insert" && f.required) {
            throw new Error(`字段 ${f.label} 必填`);
          }
          continue;
        }
        payload[f.key] = coerceFromInput(raw, f);
      }
      const relationsPayload: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(m2m)) {
        if (v.length > 0) relationsPayload[k] = v;
      }
      await onSubmit({
        values: payload,
        relations: Object.keys(relationsPayload).length > 0 ? relationsPayload : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "insert" ? "新增记录" : `编辑记录 #${pkValue ?? ""}`}
      description={schema.label}
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {mode === "insert" ? "新增" : "保存"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {rootTable.label || rootTable.alias}
              <span className="ml-1 text-xs text-muted-foreground">根表</span>
            </h3>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields
              .filter((f) => mode === "insert" || f.editable)
              .map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? ""}
                  jsonDraft={jsonDrafts[f.key]}
                  onChange={(v) => {
                    setValues((prev) => ({ ...prev, [f.key]: v }));
                  }}
                  onJsonDraftChange={(v) => {
                    setJsonDrafts((prev) => ({ ...prev, [f.key]: v }));
                    try {
                      JSON.parse(v);
                      setValues((prev) => ({ ...prev, [f.key]: v }));
                    } catch {
                      // keep raw draft, will throw on submit
                    }
                  }}
                  onPreview={setPreviewImage}
                />
              ))}
          </div>
        </section>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}

      <ImagePreviewDialog
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </Dialog>
  );
}

interface FieldInputProps {
  field: RuntimeField;
  value: string;
  jsonDraft?: string;
  onChange: (v: string) => void;
  onJsonDraftChange: (v: string) => void;
  onPreview?: (src: string) => void;
}

function FieldInput({
  field,
  value,
  jsonDraft,
  onChange,
  onJsonDraftChange,
  onPreview,
}: FieldInputProps) {
  const common = (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>{field.label}</span>
      <span className="font-mono text-[10px]">[{field.business_type}]</span>
      {field.required ? <span className="text-destructive">*</span> : null}
    </label>
  );
  switch (field.business_type) {
    case "longtext":
    case "richtext":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder={field.placeholder}
            className="w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      );
    case "boolean":
      return (
        <div className="space-y-1">
          {common}
          <label className="flex h-8 items-center gap-2 rounded-lg border bg-transparent px-3 text-sm">
            <input
              type="checkbox"
              checked={value === "true"}
              onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            />
            <span>{value === "true" ? "是" : "否"}</span>
          </label>
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          {common}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
          >
            <option value="">未选择</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "multiselect":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <div className="flex flex-wrap gap-1.5 rounded-lg border bg-transparent p-2 text-sm">
            {(field.options ?? []).map((o) => {
              const selected = tryParseList(value).includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    const list = tryParseList(value);
                    const next = selected
                      ? list.filter((v) => v !== o.value)
                      : [...list, o.value];
                    onChange(JSON.stringify(next));
                  }}
                  className={
                    selected
                      ? "rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                      : "rounded-md border bg-background px-2 py-0.5 text-xs hover:bg-muted"
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "json":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <JsonEditor
            value={jsonDraft ?? value}
            onChange={onJsonDraftChange}
            placeholder='{"key": "value"}'
            rows={6}
          />
        </div>
      );
    case "image":
    case "file":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <UploadField
            field={field}
            value={value}
            onChange={onChange}
            onPreview={onPreview}
          />
        </div>
      );
    case "images":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <UploadMultiField field={field} value={value} onChange={onChange} />
        </div>
      );
    case "color":
      return (
        <div className="space-y-1">
          {common}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value || "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-12 rounded border bg-transparent"
            />
            <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-xs" />
          </div>
        </div>
      );
    case "datetime":
    case "countdown":
      // countdown 底层就是 datetime 字面值,编辑 UI 复用 datetime-local,
      // 显示时再由 CellValue 走 CountdownCell 计算与当前时间的差值。
      return (
        <div className="space-y-1">
          {common}
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={defaultHint(field)}
            className="h-8"
          />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1">
          {common}
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={defaultHint(field)}
            className="h-8"
          />
        </div>
      );
    case "cron":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <CronPicker value={value} onChange={onChange} />
        </div>
      );
    case "qrcode":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? "可填网址、文本等任意内容,保存后会以二维码形式展示"}
            className="h-8"
          />
        </div>
      );
    default:
      return (
        <div className="space-y-1">
          {common}
          <Input
            type={
              field.business_type === "number" || field.business_type === "integer"
                ? "number"
                : field.business_type === "email"
                  ? "email"
                  : field.business_type === "url"
                    ? "url"
                    : field.business_type === "phone"
                      ? "tel"
                      : "text"
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="h-8"
          />
        </div>
      );
  }
}

interface UploadFieldProps {
  field: RuntimeField;
  value: string;
  onChange: (v: string) => void;
  onPreview?: (src: string) => void;
}

function UploadField({ value, onChange, onPreview }: UploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/uploads/123"
          className="h-8 font-mono text-xs"
        />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border bg-background px-2.5 text-xs hover:bg-muted">
          {uploading ? <Loader2 className="size-3 animate-spin" /> : null}
          上传
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const att = await uploadFile(file);
                onChange(att.url);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "上传失败");
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {value ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="清空"
            onClick={() => onChange("")}
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>
      {value ? (
        <button
          type="button"
          onClick={() => onPreview?.(value)}
          className="block"
        >
          <img
            src={absoluteUrl(value)}
            alt=""
            className="max-h-32 rounded border bg-muted"
          />
        </button>
      ) : null}
    </div>
  );
}

interface UploadMultiFieldProps {
  field: RuntimeField;
  value: string;
  onChange: (v: string) => void;
}

function UploadMultiField({ value, onChange }: UploadMultiFieldProps) {
  const list = useMemo(() => tryParseList(value), [value]);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-2">
      <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border bg-background px-2.5 text-xs hover:bg-muted">
        {uploading ? <Loader2 className="size-3 animate-spin" /> : null}
        上传图片
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length === 0) return;
            setUploading(true);
            const uploaded: { url: string }[] = [];
            for (const f of files) {
              try {
                const att = await uploadFile(f);
                uploaded.push({ url: att.url });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "上传失败");
              }
            }
            setUploading(false);
            e.target.value = "";
            onChange(JSON.stringify([...list, ...uploaded.map((u) => u.url)]));
          }}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {list.map((v, idx) => (
          <div key={idx} className="relative">
            <img
              src={absoluteUrl(v)}
              alt=""
              className="h-16 w-16 rounded border object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(JSON.stringify(list.filter((_, i) => i !== idx)))}
              className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5"
              aria-label="移除"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function tryParseList(v: string): string[] {
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.map((x) => String(x));
  } catch {
    // ignore
  }
  return [];
}

function coerceFromInput(raw: string, field: RuntimeField): unknown {
  switch (field.business_type) {
    case "json":
    case "images":
    case "multiselect": {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    case "integer":
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case "boolean":
      return raw === "true";
    case "datetime":
    case "countdown":
      return raw;
    default:
      return raw;
  }
}