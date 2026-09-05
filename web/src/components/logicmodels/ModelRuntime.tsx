import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
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
} from "@/features/logicmodels/types";

interface ModelRuntimeProps {
  slug: string;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

const PAGE_SIZE = 50;

export function ModelRuntime({ slug, onBack, onEdit, onDeleted }: ModelRuntimeProps) {
  const [schema, setSchema] = useState<RuntimeSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{
    items: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
    fields: RuntimeField[];
  } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [detail, setDetail] = useState<{ pk: string; row: Record<string, unknown> } | null>(null);
  const [detailData, setDetailData] = useState<{
    row: Record<string, unknown>;
    relations: ExpandedRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<{ pk: string; row: Record<string, unknown> } | null>(null);

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
      const r = await listRuntimeRows(slug, {
        limit: PAGE_SIZE,
        offset,
        search,
      });
      setRows({
        items: r.rows,
        total: r.total,
        limit: r.limit,
        offset: r.offset,
        fields: r.fields,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [schema, slug, offset, search]);

  useEffect(() => {
    void refreshSchema();
  }, [refreshSchema]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

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
        setOffset(Math.max(0, offset - PAGE_SIZE));
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
  const pageEnd = Math.min((rows?.offset ?? 0) + PAGE_SIZE, total);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="返回">
            <ArrowLeft className="size-3.5" />
          </Button>
          <h2 className="text-base font-medium">{schema.label}</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {schema.slug}
          </span>
          <span className="text-xs text-muted-foreground">
            · {total} 行
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" />
            编辑模型
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void handleDeleteModel()}>
            <Trash2 className="size-3.5 text-destructive" />
            删除模型
          </Button>
        </div>
      </div>

      {schema.description ? (
        <p className="text-xs text-muted-foreground">{schema.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
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
          <Button size="sm" variant="outline" onClick={() => void refreshRows()}>
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        </div>
        <Button size="sm" onClick={() => setInsertOpen(true)}>
          <Plus className="size-3.5" />
          新增记录
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {visibleFields.map((f) => (
                <th
                  key={f.key}
                  className="border-b px-3 py-2 text-left font-medium"
                >
                  <div className="flex items-center gap-1">
                    <span>{f.label}</span>
                    <span className="font-mono text-[10px]">
                      [{f.business_type}]
                    </span>
                  </div>
                </th>
              ))}
              <th className="border-b px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleFields.length + 1}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  加载中…
                </td>
              </tr>
            ) : !rows || rows.items.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleFields.length + 1}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  没有数据
                </td>
              </tr>
            ) : (
              rows.items.map((r, idx) => {
                const pk = String(r[pkName] ?? r.__pk ?? "");
                return (
                  <tr
                    key={idx}
                    className="cursor-pointer odd:bg-muted/20 hover:bg-muted/40"
                    onClick={() => void openDetail(pk)}
                  >
                    {visibleFields.map((f) => (
                      <td
                        key={f.key}
                        className="max-w-[260px] truncate border-b px-3 py-1.5 align-top text-xs"
                      >
                        <CellValue value={r[f.physical]} field={f} />
                      </td>
                    ))}
                    <td className="border-b px-3 py-1.5 text-right">
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
          {total === 0 ? "0 行" : `${pageStart} - ${pageEnd} / 共 ${total} 行`}
        </div>
        <div className="inline-flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={(rows?.offset ?? 0) === 0}
            onClick={() => setOffset(Math.max(0, (rows?.offset ?? 0) - PAGE_SIZE))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={(rows?.offset ?? 0) + PAGE_SIZE >= total}
            onClick={() => setOffset((rows?.offset ?? 0) + PAGE_SIZE)}
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
        onEditFromDetail={() => {
          if (!detail || !detailData) return;
          setEditing({ pk: detail.pk, row: detailData.row });
          setDetail(null);
          setDetailData(null);
        }}
      />
    </div>
  );
}

interface CellValueProps {
  value: unknown;
  field: RuntimeField;
}

function CellValue({ value, field }: CellValueProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (field.business_type) {
    case "image":
    case "file":
      return (
        <span className="font-mono text-[10px]">
          {String(value)}
        </span>
      );
    case "boolean":
      return value ? "✓" : "✗";
    case "images":
    case "multiselect":
    case "json":
      return <span className="font-mono text-[10px]">{summarize(value)}</span>;
    default:
      return <span>{summarize(value)}</span>;
  }
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

interface RowDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  data: { row: Record<string, unknown>; relations: ExpandedRow[] } | null;
  schema: RuntimeSchema;
  onEditFromDetail: () => void;
}

function RowDetailDialog({
  open,
  onOpenChange,
  loading,
  data,
  schema,
  onEditFromDetail,
}: RowDetailDialogProps) {
  const rootTable = schema.tables.find((t) => t.alias === schema.root_alias);
  if (!rootTable) return null;
  return (
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
          <Button type="button" onClick={onEditFromDetail} disabled={!data}>
            <Pencil className="size-3.5" />
            编辑
          </Button>
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
              <DetailField key={f.key} field={f} value={data.row[f.physical]} />
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
  );
}

function DetailField({ field, value }: { field: RuntimeField; value: unknown }) {
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{field.label}</span>
        <span className="font-mono text-[10px]">[{field.business_type}]</span>
      </div>
      <div className="break-words text-sm">
        {field.business_type === "image" || field.business_type === "file" ? (
          <DetailMedia value={value} type={field.business_type} />
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
  return <span>{String(value)}</span>;
}

function DetailMedia({
  value,
  type,
}: {
  value: unknown;
  type: "image" | "file";
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const url = String(value);
  if (type === "image") {
    return (
      <a href={absoluteUrl(url)} target="_blank" rel="noreferrer">
        <img
          src={absoluteUrl(url)}
          alt=""
          className="max-h-32 rounded border bg-muted"
        />
      </a>
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
    () => rootTable?.fields ?? [],
    [rootTable],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [m2m, setM2m] = useState<Record<string, number[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    const drafts: Record<string, string> = {};
    for (const f of fields) {
      const v = initial?.[f.physical];
      if (v === null || v === undefined) {
        seed[f.key] = "";
      } else if (typeof v === "object") {
        seed[f.key] = JSON.stringify(v);
        drafts[f.key] = JSON.stringify(v, null, 2);
      } else if (typeof v === "boolean") {
        seed[f.key] = v ? "true" : "false";
      } else {
        seed[f.key] = String(v);
      }
    }
    setValues(seed);
    setJsonDrafts(drafts);
    setM2m({});
    setError(null);
  }, [open, fields, initial]);

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
                />
              ))}
          </div>
        </section>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </Dialog>
  );
}

interface FieldInputProps {
  field: RuntimeField;
  value: string;
  jsonDraft?: string;
  onChange: (v: string) => void;
  onJsonDraftChange: (v: string) => void;
}

function FieldInput({ field, value, jsonDraft, onChange, onJsonDraftChange }: FieldInputProps) {
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
          <textarea
            value={jsonDraft ?? value}
            onChange={(e) => onJsonDraftChange(e.target.value)}
            rows={4}
            placeholder='{"key": "value"}'
            className="w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      );
    case "image":
    case "file":
      return (
        <div className="space-y-1 sm:col-span-2">
          {common}
          <UploadField field={field} value={value} onChange={onChange} />
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
      return (
        <div className="space-y-1">
          {common}
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
}

function UploadField({ value, onChange }: UploadFieldProps) {
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
        <img
          src={absoluteUrl(value)}
          alt=""
          className="max-h-32 rounded border bg-muted"
        />
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
      return raw;
    default:
      return raw;
  }
}