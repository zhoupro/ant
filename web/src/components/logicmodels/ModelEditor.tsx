import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
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
  listModelTables,
  saveModel,
} from "@/lib/api";
import type {
  FieldConfig as LMFieldConfig,
  ModelConfig,
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

type Tab = "basic" | "tables" | "relations" | "preview";

function genRelationId(): string {
  return "rel_" + Math.random().toString(36).slice(2, 10);
}

function inferBusinessType(sqlType: string): LMFieldConfig["business_type"] {
  const t = (sqlType || "").toUpperCase();
  if (t.includes("INT")) return "integer";
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUB") || t.includes("NUMERIC") || t.includes("DECIMAL")) return "number";
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("BLOB")) return "file";
  if (t.includes("DATE") || t.includes("TIME")) return "datetime";
  if (t.includes("JSON")) return "json";
  return "text";
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
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

  // 同步初始配置(打开对话框 / initial 变更时)。
  useEffect(() => {
    if (!open) return;
    setSlug(initial?.slug ?? "");
    setLabel(initial?.label ?? "");
    setDescription(initial?.description ?? "");
    setTables(initial?.config.tables ?? []);
    setRelations(initial?.config.relations ?? []);
    setRootAlias(initial?.config.root_alias ?? "");
    setTab("basic");
    setError(null);
  }, [open, initial]);

  const ensureData = useCallback(async () => {
    if (physicalTables.length > 0) return;
    setLoadingSchema(true);
    try {
      const tbl = await listModelTables();
      setPhysicalTables(tbl.tables);
      const cache: Record<string, PhysicalTable> = {};
      for (const t of tbl.tables) cache[t.name] = t;
      setSchemaCache(cache);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载表列表失败");
    } finally {
      setLoadingSchema(false);
    }
  }, [physicalTables.length]);

  const ensureTableSchema = useCallback(
    async (name: string) => {
      if (schemaCache[name]) return schemaCache[name];
      const s = await getModelTableSchema(name);
      setSchemaCache((prev) => ({ ...prev, [name]: s }));
      return s;
    },
    [schemaCache],
  );

  // 进入「表」Tab 时按需加载物理表清单。
  useEffect(() => {
    if (open && tab === "tables") void ensureData();
  }, [open, tab, ensureData]);

  const addTable = useCallback(
    async (physical: string) => {
      if (tables.some((t) => t.physical === physical)) {
        toast.error("该表已添加");
        return;
      }
      const s = await ensureTableSchema(physical);
      const alias = physical;
      const fields: LMFieldConfig[] = s.columns.map((c, idx) => ({
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
        primary_key:
          s.primary_keys[0] ?? s.columns.find((c) => c.pk)?.name ?? "id",
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
      setError("请先在「表」一栏至少添加一张表");
      setTab("tables");
      return;
    }
    const effectiveRoot = rootAlias || tables[0].alias;
    if (!tables.some((t) => t.alias === effectiveRoot)) {
      setError("请选择根表");
      setTab("tables");
      return;
    }
    for (const t of tables) {
      if (!t.primary_key) {
        setError(`表 ${t.label} 缺少主键字段`);
        setTab("tables");
        return;
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
      description="基本信息 + 多表关系;字段业务类型与默认值在「数据库」标签下编辑"
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
              保存
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
            description={description}
            setDescription={setDescription}
            slugValid={slugValid}
            onGenSlug={() => setSlug(generateSlug())}
          />
        ) : tab === "tables" ? (
          <TablesTab
            tables={tables}
            physicalTables={physicalTables}
            loading={loadingSchema}
            ensureData={ensureData}
            addTable={addTable}
            removeTable={removeTable}
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

interface TablesTabProps {
  tables: TableConfig[];
  physicalTables: PhysicalTable[];
  loading: boolean;
  ensureData: () => Promise<void>;
  addTable: (physical: string) => Promise<void>;
  removeTable: (alias: string) => void;
  rootAlias: string;
  setRootAlias: (v: string) => void;
}

// 「表」Tab 故意只做"加入物理表 / 选根表 / 移除物理表"三件事,
// 不暴露字段业务类型 / 默认值等细项 —— 这些都在「数据库」标签下编辑。
function TablesTab({
  tables,
  physicalTables,
  loading,
  ensureData,
  addTable,
  removeTable,
  rootAlias,
  setRootAlias,
}: TablesTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">受管库中的物理表</span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={() => void ensureData()}
          >
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
              {loading ? "加载中…" : "点击加载物理表"}
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
                    ({t.columns.length} 列)
                  </span>
                </button>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          字段业务类型 / 默认值请到「数据库」标签下编辑对应表结构。
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">模型中的表</span>
          <span className="text-[11px] text-muted-foreground">
            勾选星标设为主表
          </span>
        </div>
        {tables.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            还没有添加任何表。从上方选择要纳入模型的物理表。
          </p>
        ) : (
          <ul className="space-y-2">
            {tables.map((t) => (
              <li
                key={t.alias}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-card px-3 py-2",
                  rootAlias === t.alias && "border-foreground/30",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-xs",
                    rootAlias === t.alias
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => setRootAlias(t.alias)}
                  aria-label={rootAlias === t.alias ? "主表" : "设为主表"}
                  title={rootAlias === t.alias ? "主表" : "设为主表"}
                >
                  ★
                </button>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.physical}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({t.fields.length} 字段)
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    主键 {t.primary_key}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeTable(t.alias)}
                  aria-label="移除表"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
  if (tables.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
        请先在「表」一栏添加至少一张表
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
          <li>POST /api/runtime/{slug || "slug"}/rows/list</li>
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

interface TabsBarProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

function TabsBar({ tab, onTabChange }: TabsBarProps) {
  const items: { key: Tab; label: string }[] = [
    { key: "basic", label: "基本信息" },
    { key: "tables", label: "表" },
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