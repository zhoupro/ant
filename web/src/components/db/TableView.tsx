import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  addColumn,
  deleteRow,
  getTableSchema,
  insertRow,
  listRows,
  updateRow,
} from "@/lib/api";
import type { Column, RowsResponse } from "@/features/db/types";

import { AddColumnDialog } from "./AddColumnDialog";
import { RowEditor } from "./RowEditor";

interface TableViewProps {
  tableName: string;
  onMutated: () => void;
}

const PAGE_SIZE = 50;

export function TableView({ tableName, onMutated }: TableViewProps) {
  const [schema, setSchema] = useState<{
    columns: Column[];
    primary_keys: string[];
  } | null>(null);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [insertOpen, setInsertOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<{
    pk: string;
    row: Record<string, unknown>;
  } | null>(null);
  const [addColOpen, setAddColOpen] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(30);
  const [autoRefreshInput, setAutoRefreshInput] = useState("30");
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(0);
  const autoRefreshTickRef = useRef<number | null>(null);

  const refreshSchema = useCallback(async () => {
    try {
      const s = await getTableSchema(tableName);
      setSchema({ columns: s.columns, primary_keys: s.primary_keys });
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取表结构失败");
    }
  }, [tableName]);

  const refreshRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listRows(tableName, {
        limit: PAGE_SIZE,
        offset,
        search,
      });
      setData(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [tableName, offset, search]);

  useEffect(() => {
    setSchema(null);
    setData(null);
    setOffset(0);
    setSearch("");
    setSearchInput("");
    setEditingRow(null);
    void refreshSchema();
  }, [tableName, refreshSchema]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

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
  }, [autoRefreshEnabled, autoRefreshSeconds, refreshRows]);

  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const cols = schema?.columns ?? data?.columns ?? [];
  const pks = schema?.primary_keys ?? [];

  const compositePk = useMemo(
    () => buildCompositeKey(pks),
    [pks]
  );

  const onInsert = async (values: Record<string, unknown>) => {
    await insertRow(tableName, { values });
    if (offset !== 0) setOffset(0);
    else await refreshRows();
    onMutated();
  };

  const onUpdate = async (values: Record<string, unknown>) => {
    if (!editingRow) return;
    await updateRow(tableName, editingRow.pk, { values });
    await refreshRows();
    onMutated();
  };

  const onDelete = async (pk: string) => {
    if (!confirm("确定要删除该记录吗？")) return;
    await deleteRow(tableName, pk);
    if (data && (data.rows?.length ?? 0) === 1 && offset > 0) setOffset(offset - PAGE_SIZE);
    else await refreshRows();
    onMutated();
  };

  const onAddColumn = async (input: {
    name: string;
    type: string;
    notnull: boolean;
    default: string;
  }) => {
    await addColumn(tableName, input);
    await refreshSchema();
    await refreshRows();
    onMutated();
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">{tableName}</h2>
          <span className="text-xs text-muted-foreground">
            {cols.length} 个字段 · {total} 行
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setOffset(0);
                  setSearch(searchInput.trim());
                }
              }}
              placeholder="搜索…"
              className="h-7 w-44 pl-7"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshRows()}
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
            />
            <span className="text-[10px] text-muted-foreground">秒</span>
            <Button
              variant={autoRefreshEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefreshEnabled((v) => !v)}
              aria-label={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
              title={autoRefreshEnabled ? "停止自动刷新" : "开启自动刷新"}
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
          <Button size="sm" onClick={() => setInsertOpen(true)}>
            <Plus className="size-3.5" />
            新增记录
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddColOpen(true)}
          >
            <Plus className="size-3.5" />
            加列
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {cols.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-1 rounded border bg-background px-2 py-0.5"
          >
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="font-mono">{c.type || "ANY"}</span>
            {c.pk ? <span className="text-foreground">PK</span> : null}
            {c.notnull ? <span>NN</span> : null}
          </div>
        ))}
      </div>

      <Separator />

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.name}
                  className="border-b px-3 py-2 text-left font-medium"
                >
                  <div className="flex items-center gap-1">
                    <span>{c.name}</span>
                    <span className="font-mono text-[10px]">
                      [{c.type || "ANY"}]
                    </span>
                    {c.pk ? <span>PK</span> : null}
                  </div>
                </th>
              ))}
              <th className="border-b px-3 py-2 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  加载中…
                </td>
              </tr>
            ) : !data || (data.rows?.length ?? 0) === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  没有数据
                </td>
              </tr>
            ) : (
              data.rows.map((r, idx) => {
                const pk = compositePk(r);
                return (
                  <tr key={idx} className="odd:bg-muted/20">
                    {cols.map((c) => (
                      <td
                        key={c.name}
                        className="max-w-[260px] truncate border-b px-3 py-1.5 align-top font-mono text-xs"
                        title={formatCell(r[c.name])}
                      >
                        {formatCellShort(r[c.name])}
                      </td>
                    ))}
                    <td className="border-b px-3 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setEditingRow({ pk, row: r })
                          }
                          aria-label="编辑"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => void onDelete(pk)}
                          aria-label="删除"
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {total === 0
            ? "0 行"
            : `${pageStart} - ${pageEnd} / 共 ${total} 行`}
        </div>
        <div className="inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <RowEditor
        open={insertOpen}
        onOpenChange={setInsertOpen}
        mode="insert"
        columns={cols}
        primaryKeys={pks}
        onSubmit={onInsert}
      />
      <RowEditor
        open={editingRow !== null}
        onOpenChange={(v) => {
          if (!v) setEditingRow(null);
        }}
        mode="update"
        columns={cols}
        initial={editingRow?.row}
        primaryKeys={pks}
        onSubmit={onUpdate}
      />
      <AddColumnDialog
        open={addColOpen}
        onOpenChange={setAddColOpen}
        onSubmit={onAddColumn}
      />
    </div>
  );
}

function buildCompositeKey(pks: string[]): (row: Record<string, unknown>) => string {
  if (pks.length === 0) {
    return (row) => JSON.stringify(row);
  }
  if (pks.length === 1) {
    const k = pks[0];
    return (row) => encodeKeyPart(row[k]);
  }
  return (row) => pks.map((p) => encodeKeyPart(row[p])).join("__");
}

function encodeKeyPart(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatCellShort(v: unknown): string {
  const s = formatCell(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}