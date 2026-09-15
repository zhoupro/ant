import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runDashboardCard } from "@/lib/api";
import type {
  CardConfig,
  CardKind,
  CardRunResponse,
  DashboardCard,
  DashboardCardInput,
} from "@/features/dashboards/types";
import { CARD_KIND_LABELS } from "@/features/dashboards/types";
import { cn } from "@/lib/utils";

interface CardEditorDialogProps {
  open: boolean;
  dashboardId: string;
  initial: DashboardCard | null;
  onClose: () => void;
  onSaved: (input: DashboardCardInput) => Promise<void> | void;
}

const KIND_OPTIONS: CardKind[] = ["number", "line_chart"];

export function CardEditorDialog({
  dashboardId,
  initial,
  onClose,
  onSaved,
}: CardEditorDialogProps) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<CardKind>(
    (initial?.kind as CardKind) || "number",
  );
  const [sql, setSql] = useState(initial?.sql ?? "");
  const [sort, setSort] = useState<string>(
    initial?.sort != null ? String(initial.sort) : "0",
  );

  const [unit, setUnit] = useState("");
  const [decimals, setDecimals] = useState("0");
  const [xColumn, setXColumn] = useState("");
  const [yColumns, setYColumns] = useState<string[]>([]);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<CardRunResponse | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // 反序列化既有 config
  useEffect(() => {
    if (!initial) return;
    try {
      const cfg: CardConfig = initial.config
        ? (JSON.parse(initial.config) as CardConfig)
        : {};
      setUnit(cfg.unit ?? "");
      setDecimals(cfg.decimals != null ? String(cfg.decimals) : "0");
      setXColumn(cfg.x_column ?? "");
      setYColumns(cfg.y_columns ?? []);
      setColumnLabels(cfg.columns ?? {});
    } catch {
      /* 忽略 */
    }
  }, [initial]);

  const detectedColumns = preview?.columns ?? [];

  const previewRun = async () => {
    setPreviewErr(null);
    if (!initial) {
      setPreviewErr("保存后再预览");
      return;
    }
    setPreviewing(true);
    try {
      const resp = await runDashboardCard(dashboardId, initial.id);
      setPreview(resp);
    } catch (err) {
      setPreviewErr(err instanceof Error ? err.message : "执行失败");
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("请输入卡片标题");
      return;
    }
    if (!sql.trim()) {
      toast.error("请输入 SQL");
      return;
    }
    const cfg: CardConfig = {};
    if (unit.trim()) cfg.unit = unit.trim();
    if (decimals.trim() && Number(decimals) !== 0) {
      cfg.decimals = Math.max(0, Math.min(6, Number(decimals)));
    }
    if (kind === "line_chart") {
      if (xColumn.trim()) cfg.x_column = xColumn.trim();
      cfg.y_columns = yColumns;
    }
    if (Object.keys(columnLabels).length > 0) cfg.columns = columnLabels;

    setSubmitting(true);
    try {
      const input: DashboardCardInput = {
        dashboard_id: dashboardId,
        title: title.trim(),
        kind,
        sql: sql.trim(),
        config: JSON.stringify(cfg),
        sort: Number(sort) || 0,
      };
      await onSaved(input);
    } finally {
      setSubmitting(false);
    }
  };

  const labelFor = (col: string) =>
    columnLabels[col] !== undefined ? columnLabels[col] : col;

  const toggleY = (col: string) => {
    setYColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-xl bg-card text-card-foreground shadow-xl ring-1 ring-foreground/10"
      >
        <div className="shrink-0 border-b px-5 py-4">
          <h3 className="text-base font-medium leading-snug">
            {isEdit ? "编辑卡片" : "新建卡片"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            SQL 必须是只读 SELECT(或 WITH ... SELECT),最多返回 1000 行。
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                卡片标题
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="过去 30 天销量"
                className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">排序</label>
              <input
                type="number"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">卡片类型</label>
            <div className="flex gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs",
                    kind === k
                      ? "border-foreground bg-foreground text-background"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {CARD_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">SQL</label>
              {isEdit ? (
                <button
                  type="button"
                  onClick={() => void previewRun()}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  disabled={previewing}
                >
                  {previewing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3" />
                  )}
                  试运行
                </button>
              ) : null}
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={6}
              placeholder={
                kind === "line_chart"
                  ? "SELECT date, high, low FROM weather WHERE date >= date('now', '-30 day')"
                  : "SELECT COUNT(*) AS total FROM orders"
              }
              className="w-full rounded-lg border bg-transparent p-2 font-mono text-xs"
            />
            {previewErr ? (
              <p className="text-xs text-destructive" role="alert">
                {previewErr}
              </p>
            ) : null}
            {preview ? (
              <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                返回 {preview.rows.length} 行,字段:
                {preview.columns.map((c) => (
                  <code
                    key={c}
                    className="mx-1 rounded bg-background px-1 py-0.5 font-mono text-[10px]"
                  >
                    {c}
                  </code>
                ))}
              </div>
            ) : null}
          </div>

          {kind === "number" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  单位 / 后缀
                </label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="¥ / % / 次"
                  className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  小数位
                </label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    X 轴列(分类 / 时间)
                  </label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                  >
                    <option value="">自动选择第一列</option>
                    {detectedColumns.map((c) => (
                      <option key={c} value={c}>
                        {labelFor(c)}
                      </option>
                    ))}
                    {/* 检测不到时,允许手动输入:用 datalist 形式不可行,故只展示现有。 */}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Y 轴数值列(可多选)
                  </label>
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
                    {detectedColumns.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        先点击「试运行」获取列名
                      </span>
                    ) : (
                      detectedColumns
                        .filter((c) => c !== xColumn)
                        .map((c) => {
                          const on = yColumns.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => toggleY(c)}
                              className={cn(
                                "rounded border px-2 py-0.5 text-[11px]",
                                on
                                  ? "border-foreground bg-foreground text-background"
                                  : "bg-background hover:bg-muted",
                              )}
                            >
                              {labelFor(c)}
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  字段别名(选填)
                </label>
                <ColumnAliasEditor
                  columns={detectedColumns}
                  labels={columnLabels}
                  onChange={setColumnLabels}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-xl border-t bg-muted/50 px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ColumnAliasEditorProps {
  columns: string[];
  labels: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

function ColumnAliasEditor({
  columns,
  labels,
  onChange,
}: ColumnAliasEditorProps) {
  const cols = useMemo(() => columns, [columns]);
  if (cols.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        先点击「试运行」以读取列名。
      </p>
    );
  }
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {cols.map((c) => (
        <div
          key={c}
          className="flex items-center gap-2 rounded-md border bg-muted/10 px-2 py-1"
        >
          <code className="font-mono text-[10px] text-muted-foreground">
            {c}
          </code>
          <input
            value={labels[c] ?? ""}
            onChange={(e) =>
              onChange({ ...labels, [c]: e.target.value })
            }
            placeholder="展示名(可空)"
            className="h-7 flex-1 rounded border bg-transparent px-2 text-xs"
          />
        </div>
      ))}
    </div>
  );
}