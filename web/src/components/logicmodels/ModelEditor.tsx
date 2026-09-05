import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  deleteModel,
  generateSlug,
  getModelTableSchema,
  listBusinessTypes,
  listModelTables,
  saveModel,
} from "@/lib/api";
import type {
  BusinessTypeInfo,
  FieldConfig,
  ModelConfig,
  PhysicalColumn,
  PhysicalTable,
  RelationConfig,
  RelationType,
  TableConfig,
} from "@/features/logicmodels/types";

interface ModelEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: {
    slug: string;
    label: string;
    description: string;
    config: ModelConfig;
  };
  onSaved: (slug: string) => void;
}

type Tab = "basic" | "fields" | "relations" | "preview";

const STORAGE_OPTIONS_TYPES = new Set(["select", "multiselect"]);

function inferBusinessType(sqlType: string): FieldConfig["business_type"] {
  const t = (sqlType || "").toUpperCase();
  if (t.includes("INT")) return "integer";
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUB") || t.includes("NUMERIC") || t.includes("DECIMAL")) return "number";
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("BLOB")) return "file";
  if (t.includes("DATE") || t.includes("TIME")) return "text";
  if (t.includes("JSON")) return "json";
  return "text";
}

function genRelationId(): string {
  return "rel_" + Math.random().toString(36).slice(2, 10);
}

export function ModelEditor({
  open,
  onOpenChange,
  initial,
  onSaved,
}: ModelEditorProps) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tables, setTables] = useState<TableConfig[]>(initial?.config.tables ?? []);
  const [relations, setRelations] = useState<RelationConfig[]>(
    initial?.config.relations ?? [],
  );
  const [rootAlias, setRootAlias] = useState<string>(
    initial?.config.root_alias ?? "",
  );
  const [tab, setTab] = useState<Tab>("basic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeInfo[]>([]);
  const [physicalTables, setPhysicalTables] = useState<PhysicalTable[]>([]);
  const [schemaCache, setSchemaCache] = useState<Record<string, PhysicalTable>>(
    {},
  );
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const slugValid = useMemo(() => /^[a-z][a-z0-9_]*$/.test(slug), [slug]);

  const reset = useCallback(() => {
    setSlug(initial?.slug ?? "");
    setLabel(initial?.label ?? "");
    setDescription(initial?.description ?? "");
    setTables(initial?.config.tables ?? []);
    setRelations(initial?.config.relations ?? []);
    setRootAlias(initial?.config.root_alias ?? "");
    setTab("basic");
    setError(null);
  }, [initial]);

  const ensureData = useCallback(async () => {
    if (businessTypes.length > 0 && physicalTables.length > 0) return;
    setLoadingSchema(true);
    try {
      const [bt, tbl] = await Promise.all([
        listBusinessTypes(),
        listModelTables(),
      ]);
      setBusinessTypes(bt);
      setPhysicalTables(tbl.tables);
      const cache: Record<string, PhysicalTable> = {};
      for (const t of tbl.tables) cache[t.name] = t;
      setSchemaCache(cache);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载元数据失败");
    } finally {
      setLoadingSchema(false);
    }
  }, [businessTypes.length, physicalTables.length]);

  const ensureTableSchema = useCallback(
    async (name: string) => {
      if (schemaCache[name]) return schemaCache[name];
      const s = await getModelTableSchema(name);
      setSchemaCache((prev) => ({ ...prev, [name]: s }));
      return s;
    },
    [schemaCache],
  );

  const addTable = useCallback(
    async (physical: string) => {
      if (tables.some((t) => t.physical === physical)) {
        toast.error("该表已添加");
        return;
      }
      const s = await ensureTableSchema(physical);
      const alias = physical;
      const fields: FieldConfig[] = s.columns.map((c, idx) => ({
        key: c.name,
        physical: c.name,
        label: humanize(c.name),
        business_type: inferBusinessType(c.type),
        required: c.notnull && !c.pk,
        editable: !c.pk,
        list_show: idx <= 4,
        searchable: !c.pk && inferBusinessType(c.type) === "text",
        sort: idx,
      }));
      const tcfg: TableConfig = {
        alias,
        physical,
        label: humanize(physical),
        primary_key: s.primary_keys[0] ?? s.columns.find((c) => c.pk)?.name ?? "id",
        fields,
      };
      setTables((prev) => [...prev, tcfg]);
      setRootAlias((prev) => prev || alias);
    },
    [ensureTableSchema, tables],
  );

  const removeTable = useCallback((alias: string) => {
    setTables((prev) => prev.filter((t) => t.alias !== alias));
    setRelations((prev) =>
      prev.filter((r) => r.from_alias !== alias && r.to_alias !== alias),
    );
    setRootAlias((prev) => (prev === alias ? "" : prev));
  }, []);

  const updateTable = useCallback(
    (alias: string, patch: Partial<TableConfig>) => {
      setTables((prev) =>
        prev.map((t) => (t.alias === alias ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const updateField = useCallback(
    (alias: string, idx: number, patch: Partial<FieldConfig>) => {
      setTables((prev) =>
        prev.map((t) => {
          if (t.alias !== alias) return t;
          return {
            ...t,
            fields: t.fields.map((f, i) =>
              i === idx ? { ...f, ...patch } : f,
            ),
          };
        }),
      );
    },
    [],
  );

  const removeField = useCallback((alias: string, idx: number) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.alias !== alias) return t;
        return { ...t, fields: t.fields.filter((_, i) => i !== idx) };
      }),
    );
  }, []);

  const moveField = useCallback(
    (alias: string, idx: number, dir: -1 | 1) => {
      setTables((prev) =>
        prev.map((t) => {
          if (t.alias !== alias) return t;
          const next = t.fields.slice();
          const swapIdx = idx + dir;
          if (swapIdx < 0 || swapIdx >= next.length) return t;
          [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
          return { ...t, fields: next };
        }),
      );
    },
    [],
  );

  const addRelation = useCallback(() => {
    setRelations((prev) => [
      ...prev,
      {
        id: genRelationId(),
        type: "one_to_many",
        from_alias: tables[0]?.alias ?? "",
        from_column: "",
        to_alias: tables[1]?.alias ?? tables[0]?.alias ?? "",
        to_column: "",
        label: "",
      },
    ]);
  }, [tables]);

  const updateRelation = useCallback(
    (id: string, patch: Partial<RelationConfig>) => {
      setRelations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const removeRelation = useCallback((id: string) => {
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (!slugValid) {
      setError("唯一名字必须以小写字母开头,只能包含小写字母、数字与下划线");
      setTab("basic");
      return;
    }
    if (!label.trim()) {
      setError("请填写展示名");
      setTab("basic");
      return;
    }
    if (tables.length === 0) {
      setError("请至少添加一张表");
      setTab("fields");
      return;
    }
    const effectiveRoot = rootAlias || tables[0].alias;
    if (!tables.some((t) => t.alias === effectiveRoot)) {
      setError("请选择根表");
      setTab("fields");
      return;
    }
    for (const t of tables) {
      if (!t.primary_key) {
        setError(`表 ${t.label} 缺少主键字段`);
        setTab("fields");
        return;
      }
      for (const f of t.fields) {
        if (!f.key.trim()) {
          setError(`表 ${t.label} 存在未命名字段`);
          setTab("fields");
          return;
        }
        if (!f.physical.trim()) {
          setError(`表 ${t.label} 字段 ${f.key} 未绑定物理列`);
          setTab("fields");
          return;
        }
      }
    }
    for (const r of relations) {
      if (r.type === "many_to_many") {
        if (!r.join_table || !r.join_from_column || !r.join_to_column) {
          setError("多对多关系必须填写关联表与字段");
          setTab("relations");
          return;
        }
      } else {
        if (!r.from_column || !r.to_column) {
          setError("请填写关系的字段");
          setTab("relations");
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const config: ModelConfig = {
        root_alias: effectiveRoot,
        tables,
        relations,
      };
      await saveModel({
        slug,
        label,
        description,
        config,
      });
      toast.success("已保存");
      onSaved(slug);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!confirm(`确定删除逻辑模型 "${label}" 吗?此操作不可恢复`)) return;
    setDeleting(true);
    try {
      await deleteModel(slug);
      toast.success("已删除");
      onSaved("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={initial ? `编辑逻辑模型 · ${initial.label}` : "新建逻辑模型"}
      description="选择物理表、配置字段与关系,自动生成增删改查接口"
      size="lg"
      className="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {initial ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                删除模型
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              保存并生成接口
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TabsBar tab={tab} onTabChange={setTab} />
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {tab === "basic" ? (
          <BasicTab
            slug={slug}
            setSlug={setSlug}
            label={label}
            setLabel={setLabel}
            setDescription={setDescription}
            description={description}
            slugValid={slugValid}
            onGenSlug={() => setSlug(generateSlug())}
          />
        ) : tab === "fields" ? (
          <FieldsTab
            tables={tables}
            physicalTables={physicalTables}
            schemaCache={schemaCache}
            loading={loadingSchema}
            ensureData={ensureData}
            addTable={addTable}
            removeTable={removeTable}
            updateTable={updateTable}
            updateField={updateField}
            removeField={removeField}
            moveField={moveField}
            businessTypes={businessTypes}
            rootAlias={rootAlias || tables[0]?.alias || ""}
            setRootAlias={setRootAlias}
          />
        ) : tab === "relations" ? (
          <RelationsTab
            tables={tables}
            relations={relations}
            addRelation={addRelation}
            updateRelation={updateRelation}
            removeRelation={removeRelation}
          />
        ) : (
          <PreviewTab
            slug={slug}
            label={label}
            tables={tables}
            relations={relations}
            rootAlias={rootAlias || tables[0]?.alias || ""}
          />
        )}
      </div>
    </Dialog>
  );
}

interface BasicTabProps {
  slug: string;
  setSlug: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  slugValid: boolean;
  onGenSlug: () => void;
}

function BasicTab({
  slug,
  setSlug,
  label,
  setLabel,
  description,
  setDescription,
  slugValid,
  onGenSlug,
}: BasicTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs text-muted-foreground">唯一名字 (slug)</label>
          <button
            type="button"
            onClick={onGenSlug}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            随机生成
          </button>
        </div>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="例如 blog"
          className="font-mono"
        />
        {!slugValid ? (
          <p className="text-[11px] text-destructive">
            必须以小写字母开头,只能包含小写字母、数字与下划线
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            将用于生成接口路径,如 <code className="font-mono">/api/runtime/{slug || "blog"}/rows</code>
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">展示名</label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="博客文章"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">说明</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="可选,用于描述此模型的用途"
        />
      </div>
    </div>
  );
}

interface FieldsTabProps {
  tables: TableConfig[];
  physicalTables: PhysicalTable[];
  schemaCache: Record<string, PhysicalTable>;
  loading: boolean;
  ensureData: () => Promise<void>;
  addTable: (physical: string) => Promise<void>;
  removeTable: (alias: string) => void;
  updateTable: (alias: string, patch: Partial<TableConfig>) => void;
  updateField: (alias: string, idx: number, patch: Partial<FieldConfig>) => void;
  removeField: (alias: string, idx: number) => void;
  moveField: (alias: string, idx: number, dir: -1 | 1) => void;
  businessTypes: BusinessTypeInfo[];
  rootAlias: string;
  setRootAlias: (v: string) => void;
}

function FieldsTab({
  tables,
  physicalTables,
  schemaCache,
  loading,
  ensureData,
  addTable,
  removeTable,
  updateTable,
  updateField,
  removeField,
  moveField,
  businessTypes,
  rootAlias,
  setRootAlias,
}: FieldsTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">物理表</span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={() => void ensureData()}
          >
            <RefreshIcon />
            刷新
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {physicalTables.length === 0 ? (
            <button
              type="button"
              onClick={() => void ensureData()}
              className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {loading ? "加载中…" : "点击加载数据库中的表"}
            </button>
          ) : (
            physicalTables.map((t) => {
              const used = tables.some((cfg) => cfg.physical === t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={used}
                  onClick={() => void addTable(t.name)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                    used
                      ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  <Plus className="size-3" />
                  {t.name}
                  <span className="text-[10px] text-muted-foreground">
                    ({t.columns.length})
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        {tables.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            还没有添加任何表。先在「物理表」一栏选择几张表。
          </p>
        ) : (
          tables.map((t) => (
            <TableCard
              key={t.alias}
              table={t}
              isRoot={t.alias === rootAlias}
              physicalSchema={schemaCache[t.physical]}
              onSetRoot={() => setRootAlias(t.alias)}
              onRemove={() => removeTable(t.alias)}
              onUpdate={(patch) => updateTable(t.alias, patch)}
              onUpdateField={(idx, patch) => updateField(t.alias, idx, patch)}
              onRemoveField={(idx) => removeField(t.alias, idx)}
              onMoveField={(idx, dir) => moveField(t.alias, idx, dir)}
              businessTypes={businessTypes}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

interface TableCardProps {
  table: TableConfig;
  isRoot: boolean;
  physicalSchema?: PhysicalTable;
  onSetRoot: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<TableConfig>) => void;
  onUpdateField: (idx: number, patch: Partial<FieldConfig>) => void;
  onRemoveField: (idx: number) => void;
  onMoveField: (idx: number, dir: -1 | 1) => void;
  businessTypes: BusinessTypeInfo[];
}

function TableCard({
  table,
  isRoot,
  physicalSchema,
  onSetRoot,
  onRemove,
  onUpdate,
  onUpdateField,
  onRemoveField,
  onMoveField,
  businessTypes,
}: TableCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start gap-3 border-b bg-muted/20 px-3 py-2.5">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={table.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="h-7 w-32"
              placeholder="表别名"
            />
            <span className="font-mono text-xs text-muted-foreground">
              {table.physical}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ({table.fields.length} 字段)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-muted-foreground">别名</label>
            <Input
              value={table.alias}
              onChange={(e) =>
                onUpdate({ alias: e.target.value.replace(/\s+/g, "_") })
              }
              className="h-6 w-32 font-mono text-[11px]"
            />
            <label className="text-muted-foreground">主键</label>
            <select
              value={table.primary_key}
              onChange={(e) => onUpdate({ primary_key: e.target.value })}
              className="h-6 rounded-md border bg-transparent px-2 text-[11px]"
            >
              {(physicalSchema?.columns ?? [])
                .filter((c) => c.pk)
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              {(!physicalSchema ||
                !physicalSchema.columns.some((c) => c.pk)) && (
                <option value={table.primary_key}>{table.primary_key}</option>
              )}
            </select>
            <button
              type="button"
              onClick={onSetRoot}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px]",
                isRoot
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {isRoot ? "根表" : "设为根表"}
            </button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label="移除表"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5 p-2.5">
        {table.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">未配置任何字段</p>
        ) : (
          table.fields.map((f, idx) => (
            <FieldRow
              key={`${f.physical}-${idx}`}
              field={f}
              physical={physicalSchema?.columns.find((c) => c.name === f.physical)}
              businessTypes={businessTypes}
              onUpdate={(patch) => onUpdateField(idx, patch)}
              onRemove={() => onRemoveField(idx)}
              onMoveUp={() => onMoveField(idx, -1)}
              onMoveDown={() => onMoveField(idx, 1)}
              canMoveUp={idx > 0}
              canMoveDown={idx < table.fields.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: FieldConfig;
  physical?: PhysicalColumn;
  businessTypes: BusinessTypeInfo[];
  onUpdate: (patch: Partial<FieldConfig>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function FieldRow({
  field,
  physical,
  businessTypes,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: FieldRowProps) {
  const needsOptions = STORAGE_OPTIONS_TYPES.has(field.business_type);
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className={cn(
              "rounded p-0.5 text-muted-foreground hover:bg-muted",
              !canMoveUp && "invisible",
            )}
            aria-label="上移"
          >
            <CaretUp />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className={cn(
              "rounded p-0.5 text-muted-foreground hover:bg-muted",
              !canMoveDown && "invisible",
            )}
            aria-label="下移"
          >
            <CaretDown />
          </button>
        </div>
        <Input
          value={field.key}
          onChange={(e) =>
            onUpdate({ key: e.target.value.replace(/\s+/g, "_") })
          }
          className="h-6 w-24 font-mono text-[11px]"
          placeholder="key"
        />
        <Input
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-6 w-24 text-[11px]"
          placeholder="展示名"
        />
        <select
          value={field.business_type}
          onChange={(e) =>
            onUpdate({ business_type: e.target.value as FieldConfig["business_type"] })
          }
          className="h-6 rounded-md border bg-transparent px-2 text-[11px]"
        >
          {businessTypes.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <FlagToggle
          active={field.editable}
          onChange={(v) => onUpdate({ editable: v })}
          label="可编辑"
        />
        <FlagToggle
          active={field.list_show}
          onChange={(v) => onUpdate({ list_show: v })}
          label="列表"
        />
        <FlagToggle
          active={field.searchable}
          onChange={(v) => onUpdate({ searchable: v })}
          label="可搜索"
        />
        <FlagToggle
          active={field.required}
          onChange={(v) => onUpdate({ required: v })}
          label="必填"
        />
        <Input
          value={field.placeholder ?? ""}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          className="h-6 w-24 text-[11px]"
          placeholder="提示"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">
            {physical?.type ?? field.physical}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label="移除字段"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
      {needsOptions ? (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onUpdate({ options })}
        />
      ) : null}
    </div>
  );
}

interface OptionsEditorProps {
  options: { label: string; value: string }[];
  onChange: (next: { label: string; value: string }[]) => void;
}

function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  return (
    <div className="mt-2 space-y-1.5 rounded-md border bg-background/60 p-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>选项</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() =>
            onChange([...options, { label: "", value: "" }])
          }
        >
          <Plus className="size-3" />
          添加
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">还没有选项</p>
      ) : (
        <div className="space-y-1">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <Input
                value={opt.label}
                onChange={(e) => {
                  const next = options.slice();
                  next[idx] = { ...next[idx], label: e.target.value };
                  onChange(next);
                }}
                placeholder="标签"
                className="h-6 w-24 text-[11px]"
              />
              <Input
                value={opt.value}
                onChange={(e) => {
                  const next = options.slice();
                  next[idx] = { ...next[idx], value: e.target.value };
                  onChange(next);
                }}
                placeholder="值"
                className="h-6 w-24 font-mono text-[11px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onChange(options.filter((_, i) => i !== idx))}
                aria-label="删除选项"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FlagToggleProps {
  active: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

function FlagToggle({ active, onChange, label }: FlagToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={cn(
        "h-6 rounded-md border px-2 text-[11px]",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-dashed bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

interface RelationsTabProps {
  tables: TableConfig[];
  relations: RelationConfig[];
  addRelation: () => void;
  updateRelation: (id: string, patch: Partial<RelationConfig>) => void;
  removeRelation: (id: string) => void;
}

function RelationsTab({
  tables,
  relations,
  addRelation,
  updateRelation,
  removeRelation,
}: RelationsTabProps) {
  if (tables.length < 1) {
    return (
      <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
        请先在「字段」一栏添加表
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">关系</span>
        <Button type="button" size="xs" variant="ghost" onClick={addRelation}>
          <Plus className="size-3" />
          添加关系
        </Button>
      </div>
      {relations.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          还没有配置关系。可选:1 对 1 / 1 对多 / 多对多
        </p>
      ) : (
        <div className="space-y-2">
          {relations.map((r) => (
            <RelationCard
              key={r.id}
              relation={r}
              tables={tables}
              onUpdate={(patch) => updateRelation(r.id, patch)}
              onRemove={() => removeRelation(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RelationCardProps {
  relation: RelationConfig;
  tables: TableConfig[];
  onUpdate: (patch: Partial<RelationConfig>) => void;
  onRemove: () => void;
}

function RelationCard({ relation, tables, onUpdate, onRemove }: RelationCardProps) {
  const fromTable = tables.find((t) => t.alias === relation.from_alias);
  const toTable = tables.find((t) => t.alias === relation.to_alias);
  const fromFields = fromTable?.fields ?? [];
  const toFields = toTable?.fields ?? [];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={relation.label ?? ""}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="关系名"
          className="h-7 w-32"
        />
        <select
          value={relation.type}
          onChange={(e) => onUpdate({ type: e.target.value as RelationType })}
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        >
          <option value="one_to_one">一对一</option>
          <option value="one_to_many">一对多</option>
          <option value="many_to_many">多对多</option>
        </select>
        <span className="text-xs text-muted-foreground">来自</span>
        <select
          value={relation.from_alias}
          onChange={(e) => onUpdate({ from_alias: e.target.value, from_column: "" })}
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        >
          {tables.map((t) => (
            <option key={t.alias} value={t.alias}>
              {t.label || t.alias}
            </option>
          ))}
        </select>
        <FieldSelect
          value={relation.from_column}
          options={fromFields.map((f) => ({
            value: f.physical,
            label: `${f.label} (${f.physical})`,
          }))}
          placeholder="字段"
          onChange={(v) => onUpdate({ from_column: v })}
        />
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-xs text-muted-foreground">指向</span>
        <select
          value={relation.to_alias}
          onChange={(e) => onUpdate({ to_alias: e.target.value, to_column: "" })}
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        >
          {tables.map((t) => (
            <option key={t.alias} value={t.alias}>
              {t.label || t.alias}
            </option>
          ))}
        </select>
        <FieldSelect
          value={relation.to_column}
          options={toFields.map((f) => ({
            value: f.physical,
            label: `${f.label} (${f.physical})`,
          }))}
          placeholder="字段"
          onChange={(v) => onUpdate({ to_column: v })}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label="删除关系"
          className="ml-auto"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
      {relation.type === "many_to_many" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input
            value={relation.join_table ?? ""}
            onChange={(e) => onUpdate({ join_table: e.target.value })}
            placeholder="关联表"
            className="h-7 font-mono text-xs"
          />
          <Input
            value={relation.join_from_column ?? ""}
            onChange={(e) => onUpdate({ join_from_column: e.target.value })}
            placeholder="来源字段 (例如 post_id)"
            className="h-7 font-mono text-xs"
          />
          <Input
            value={relation.join_to_column ?? ""}
            onChange={(e) => onUpdate({ join_to_column: e.target.value })}
            placeholder="目标字段 (例如 tag_id)"
            className="h-7 font-mono text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}

interface FieldSelectProps {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string) => void;
}

function FieldSelect({ value, options, placeholder, onChange }: FieldSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 rounded-md border bg-transparent px-2 text-xs"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface PreviewTabProps {
  slug: string;
  label: string;
  tables: TableConfig[];
  relations: RelationConfig[];
  rootAlias: string;
}

function PreviewTab({ slug, label, tables, relations, rootAlias }: PreviewTabProps) {
  const root = tables.find((t) => t.alias === rootAlias) ?? tables[0];
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="text-[11px] text-muted-foreground">模型</div>
        <div className="mt-1 font-medium">
          {label || "(未命名)"} <code className="font-mono">/{slug || "slug"}</code>
        </div>
      </div>
      <div className="rounded-md border bg-card p-3">
        <div className="text-[11px] text-muted-foreground">自动生成的接口</div>
        <ul className="mt-1 space-y-0.5 font-mono">
          <li>GET /api/runtime/{slug || "slug"}/schema</li>
          <li>GET /api/runtime/{slug || "slug"}/rows</li>
          <li>GET /api/runtime/{slug || "slug"}/rows/:id</li>
          <li>POST /api/runtime/{slug || "slug"}/rows</li>
          <li>PUT /api/runtime/{slug || "slug"}/rows/:id</li>
          <li>DELETE /api/runtime/{slug || "slug"}/rows/:id</li>
        </ul>
      </div>
      {root ? (
        <div className="rounded-md border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">根表字段</div>
          <div className="mt-1 space-y-0.5">
            {root.fields.map((f) => (
              <div key={f.key} className="flex items-center gap-1">
                <span className="font-mono">{f.key}</span>
                <span className="text-[10px] text-muted-foreground">
                  [{f.business_type}]
                </span>
                {f.required ? <span className="text-destructive">*</span> : null}
                {!f.editable ? <span className="text-[10px]">只读</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-md border bg-card p-3">
        <div className="text-[11px] text-muted-foreground">关系</div>
        {relations.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">无</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {relations.map((r) => (
              <li key={r.id}>
                <span className="font-mono">{r.type}</span> · {r.from_alias}.{r.from_column || "?"} → {r.to_alias}.{r.to_column || "?"}
                {r.type === "many_to_many" ? (
                  <span className="text-[10px] text-muted-foreground">
                    via {r.join_table || "?"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CaretUp() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function CaretDown() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface TabsBarProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

function TabsBar({ tab, onTabChange }: TabsBarProps) {
  const items: { key: Tab; label: string }[] = [
    { key: "basic", label: "基本信息" },
    { key: "fields", label: "表与字段" },
    { key: "relations", label: "关系" },
    { key: "preview", label: "预览" },
  ];
  return (
    <div className="flex gap-1 border-b">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTabChange(t.key)}
          className={cn(
            "border-b-2 px-3 py-1.5 text-xs transition-colors",
            tab === t.key
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}