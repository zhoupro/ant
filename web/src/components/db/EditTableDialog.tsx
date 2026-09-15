import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addColumn,
  alterColumn,
  autoCreateModel,
  dropColumn,
  getModel,
  getTableSchema,
  listBusinessTypes,
  saveModel,
} from "@/lib/api";
import type {
  BusinessType,
  BusinessTypeInfo,
  FieldConfig,
  ModelConfig,
} from "@/features/logicmodels/types";
import {
  FieldEditorRow,
  type PhysicalInfo,
} from "./FieldEditorRow";

interface EditTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  onChanged?: () => void;
}

interface DraftRow {
  uid: string;
  physical: PhysicalInfo;
  originalPhysical?: PhysicalInfo;
  field: FieldConfig;
  isNew: boolean;
  removed: boolean;
}

function genUid(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}`;
}

function inferBusinessType(sqlType: string): BusinessType {
  const t = (sqlType || "").toUpperCase();
  if (t.includes("INT")) return "integer";
  if (
    t.includes("REAL") ||
    t.includes("FLOAT") ||
    t.includes("DOUB") ||
    t.includes("NUMERIC") ||
    t.includes("DECIMAL")
  ) {
    return "number";
  }
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("BLOB")) return "file";
  if (t.includes("DATETIME") || t.includes("TIMESTAMP")) return "datetime";
  if (t.includes("DATE")) return "date";
  if (t.includes("TIME")) return "datetime";
  if (t.includes("JSON")) return "json";
  return "text";
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function makeField(
  phys: PhysicalInfo,
  idx: number,
  override?: FieldConfig,
): FieldConfig {
  if (override) return override;
  const biz = inferBusinessType(phys.type);
  return {
    key: phys.name,
    physical: phys.name,
    label: humanize(phys.name),
    business_type: biz,
    required: phys.notnull,
    editable: !phys.pk,
    list_show: idx <= 4,
    searchable: !phys.pk && biz === "text",
    sort: idx,
  };
}

function emptyPhysical(): PhysicalInfo {
  return { name: "", type: "TEXT", notnull: false, pk: false, default: "" };
}

function makeNewRow(idx: number): DraftRow {
  const phys = emptyPhysical();
  return {
    uid: genUid(),
    physical: phys,
    field: makeField(phys, idx),
    isNew: true,
    removed: false,
  };
}

function physicalEqual(a: PhysicalInfo, b: PhysicalInfo): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.notnull === b.notnull &&
    a.pk === b.pk &&
    a.default === b.default
  );
}

export function EditTableDialog({
  open,
  onOpenChange,
  tableName,
  onChanged,
}: EditTableDialogProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeInfo[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const slug = useMemo(() => `auto_${tableName}`, [tableName]);

  const reset = useCallback(() => {
    setError(null);
    setPendingDelete(null);
    setModelLabel("");
    setModelDescription("");
    setRows([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    setLoading(true);
    void (async () => {
      try {
        const [schema, types] = await Promise.all([
          getTableSchema(tableName),
          listBusinessTypes(),
        ]);
        setBusinessTypes(types);
        try {
          await getModel(slug);
        } catch {
          await autoCreateModel({ physical: tableName });
        }
        const m = await getModel(slug);
        setModelLabel(m.label);
        setModelDescription(m.description);
        const cfg = JSON.parse(m.config) as ModelConfig;
        const tableCfg = cfg.tables[0];
        const byPhysical = new Map<string, FieldConfig>();
        for (const f of tableCfg?.fields ?? []) {
          byPhysical.set(f.physical, f);
        }
        const next: DraftRow[] = schema.columns.map((col, idx) => {
          const phys: PhysicalInfo = {
            name: col.name,
            type: col.type,
            notnull: col.notnull,
            pk: col.pk,
            default: col.default ?? "",
          };
          return {
            uid: genUid(),
            physical: phys,
            originalPhysical: { ...phys },
            field: makeField(phys, idx, byPhysical.get(col.name)),
            isNew: false,
            removed: false,
          };
        });
        setRows(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tableName, slug, reset]);

  const updateRow = (
    uid: string,
    patch: { physical?: Partial<PhysicalInfo>; field?: Partial<FieldConfig> },
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const nextPhys: PhysicalInfo = patch.physical
          ? { ...r.physical, ...patch.physical }
          : r.physical;
        const nextField: FieldConfig = patch.field
          ? { ...r.field, ...patch.field }
          : r.field;
        if (patch.physical) {
          const inferredBiz = inferBusinessType(nextPhys.type);
          const bizIsAuto =
            r.field.business_type === inferBusinessType(r.physical.type);
          nextField.business_type = bizIsAuto ? inferredBiz : r.field.business_type;
          nextField.required = nextPhys.notnull;
          if (nextPhys.pk) nextField.editable = false;
        }
        if (patch.physical?.name !== undefined) {
          nextField.physical = nextPhys.name;
          if (!r.field.key || r.field.key === r.physical.name) {
            nextField.key = nextPhys.name;
          }
        }
        return { ...r, physical: nextPhys, field: nextField };
      }),
    );
  };

  const handleRemove = (uid: string) => {
    const row = rows.find((r) => r.uid === uid);
    if (!row || row.removed) return;
    if (row.physical.pk && !row.isNew) {
      setError("主键字段不可删除");
      return;
    }
    if (row.isNew) {
      setRows((prev) => prev.filter((r) => r.uid !== uid));
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, removed: true } : r)),
    );
    setPendingDelete(null);
  };

  const handleRestore = (uid: string) => {
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, removed: false } : r)),
    );
  };

  const handleAddField = () => {
    setError(null);
    setRows((prev) => [
      ...prev,
      makeNewRow(prev.filter((r) => !r.removed).length),
    ]);
  };

  const handleSubmit = async () => {
    setError(null);
    const finalRows = rows.filter((r) => !r.removed);
    if (finalRows.length === 0) {
      setError("至少保留一个字段");
      return;
    }
    const seen = new Set<string>();
    for (const r of finalRows) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(r.physical.name)) {
        setError(`字段名不合法: ${r.physical.name || "(空)"}`);
        return;
      }
      if (seen.has(r.physical.name)) {
        setError(`字段名重复: ${r.physical.name}`);
        return;
      }
      seen.add(r.physical.name);
    }
    const pks = finalRows.filter((r) => r.physical.pk);
    if (pks.length === 0) {
      setError("请至少保留一个主键字段");
      return;
    }
    if (!modelLabel.trim()) {
      setError("请填写展示名");
      return;
    }
    setSubmitting(true);
    try {
      const toDrop = rows.filter(
        (r) => r.removed && !r.isNew && r.originalPhysical,
      );
      const toAdd = rows.filter((r) => r.isNew && !r.removed);
      const toAlter = rows.filter(
        (r) =>
          !r.isNew &&
          !r.removed &&
          r.originalPhysical &&
          !physicalEqual(r.originalPhysical, r.physical),
      );

      for (const r of toDrop) {
        if (!r.originalPhysical) continue;
        await dropColumn(tableName, r.originalPhysical.name);
      }
      for (const r of toAdd) {
        await addColumn(tableName, {
          name: r.physical.name,
          type: r.physical.type,
          notnull: r.physical.notnull,
          default: r.physical.default,
        });
      }
      for (const r of toAlter) {
        if (!r.originalPhysical) continue;
        await alterColumn(tableName, r.originalPhysical.name, {
          name: r.physical.name,
          type: r.physical.type,
          notnull: r.physical.notnull,
          default: r.physical.default,
        });
      }

      const fields: FieldConfig[] = finalRows.map((r, idx) => ({
        ...r.field,
        key: r.field.key.trim() || r.physical.name,
        physical: r.physical.name,
        sort: idx,
      }));
      const primaryKey = pks[0]?.physical.name ?? "id";
      const finalLabel = modelLabel.trim();
      const cfg: ModelConfig = {
        root_alias: tableName,
        tables: [
          {
            alias: tableName,
            physical: tableName,
            label: finalLabel,
            primary_key: primaryKey,
            fields,
          },
        ],
        relations: [],
      };

      await saveModel({
        slug,
        label: finalLabel,
        description: modelDescription.trim(),
        config: cfg,
      });
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleRows = rows.filter((r) => !r.removed);
  const newCount = visibleRows.filter((r) => r.isNew).length;
  const alterCount = visibleRows.filter(
    (r) => !r.isNew && r.originalPhysical && !physicalEqual(r.originalPhysical, r.physical),
  ).length;
  const removedCount = rows.filter((r) => r.removed && !r.isNew).length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`编辑表 · ${tableName}`}
      description="调整字段物理结构与业务类型,一次保存,统一生效"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {visibleRows.length} 个字段
            {newCount > 0 ? ` · 新增 ${newCount}` : ""}
            {alterCount > 0 ? ` · 改动 ${alterCount}` : ""}
            {removedCount > 0 ? ` · 待删 ${removedCount}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              disabled={submitting || loading}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              保存
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">表名</label>
            <Input
              value={tableName}
              readOnly
              disabled
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">展示名 *</label>
            <Input
              value={modelLabel}
              onChange={(e) => setModelLabel(e.target.value)}
              placeholder="表展示名"
              className="h-8 text-sm"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">说明(可选)</label>
            <Input
              value={modelDescription}
              onChange={(e) => setModelDescription(e.target.value)}
              placeholder="用途描述"
              className="h-8 text-sm"
              disabled={submitting}
            />
          </div>
        </section>

        <section className="space-y-2">
          <header className="flex items-center justify-between">
            <h4 className="text-sm font-medium">字段</h4>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleAddField}
              disabled={submitting}
            >
              <Plus className="size-3" />
              添加字段
            </Button>
          </header>
          {loading ? (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </div>
          ) : visibleRows.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              暂无字段,点击右上「添加字段」开始
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((r) => (
                <FieldEditorRow
                  key={r.uid}
                  physical={r.physical}
                  field={r.field}
                  businessTypes={businessTypes}
                  physicalEditable
                  onPhysicalChange={(patch) =>
                    updateRow(r.uid, { physical: patch })
                  }
                  onFieldChange={(patch) => updateRow(r.uid, { field: patch })}
                  onRemove={() => handleRemove(r.uid)}
                  pendingDelete={pendingDelete === r.uid}
                  onAskDelete={() => setPendingDelete(r.uid)}
                  onCancelDelete={() => setPendingDelete(null)}
                  canRemove={r.isNew || !r.physical.pk}
                  isNew={r.isNew}
                  submitting={submitting}
                />
              ))}
            </ul>
          )}
        </section>

        {removedCount > 0 ? (
          <section className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <header className="flex items-center justify-between text-xs">
              <span className="font-medium text-destructive">待删除字段</span>
              <span className="text-muted-foreground">点击「撤销」可恢复</span>
            </header>
            <ul className="space-y-1">
              {rows
                .filter((r) => r.removed && !r.isNew)
                .map((r) => (
                  <li
                    key={r.uid}
                    className="flex items-center justify-between rounded border bg-background/60 px-2 py-1 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono">
                        {r.originalPhysical?.name ?? r.physical.name}
                      </span>
                      <span className="text-muted-foreground">
                        {r.physical.type}
                      </span>
                      {r.field.label ? (
                        <span className="text-muted-foreground">
                          · {r.field.label}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={submitting}
                      onClick={() => handleRestore(r.uid)}
                    >
                      撤销
                    </Button>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
