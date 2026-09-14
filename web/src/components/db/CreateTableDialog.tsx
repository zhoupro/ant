import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listBusinessTypes } from "@/lib/api";
import type { CreateTableInput } from "@/features/db/types";
import type {
  BusinessType,
  BusinessTypeInfo,
  FieldConfig,
  ModelConfig,
} from "@/features/logicmodels/types";

import { FieldEditorRow, type PhysicalInfo } from "./FieldEditorRow";

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateTableSubmitInput) => Promise<void>;
}

export interface CreateTableSubmitInput {
  table: CreateTableInput;
  model: {
    label: string;
    description: string;
    config: ModelConfig;
  };
}

interface DraftCol {
  uid: string;
  physical: PhysicalInfo;
  field: FieldConfig;
}

function genUid(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
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
  if (t.includes("DATE") || t.includes("TIME")) return "text";
  if (t.includes("JSON")) return "json";
  return "text";
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function makeField(phys: PhysicalInfo, idx: number): FieldConfig {
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

function makeCol(phys: PhysicalInfo, idx: number): DraftCol {
  return { uid: genUid(), physical: phys, field: makeField(phys, idx) };
}

function defaultColumns(): DraftCol[] {
  const idPhys: PhysicalInfo = {
    name: "id",
    type: "INTEGER",
    notnull: true,
    pk: true,
    default: "",
  };
  const namePhys: PhysicalInfo = {
    name: "name",
    type: "TEXT",
    notnull: true,
    pk: false,
    default: "",
  };
  return [makeCol(idPhys, 0), makeCol(namePhys, 1)];
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateTableDialogProps) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<DraftCol[]>(defaultColumns());
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLabel("");
    setDescription("");
    setColumns(defaultColumns());
    setError(null);
    if (businessTypes.length === 0) {
      void (async () => {
        try {
          const types = await listBusinessTypes();
          setBusinessTypes(types);
        } catch {
          // 静默失败:即使取不到业务类型,用户仍可继续创建
        }
      })();
    }
  }, [open, businessTypes.length]);

  const updateCol = (uid: string, patch: { physical?: Partial<PhysicalInfo>; field?: Partial<FieldConfig> }) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.uid !== uid) return c;
        const nextPhys: PhysicalInfo = patch.physical
          ? { ...c.physical, ...patch.physical }
          : c.physical;
        const nextField: FieldConfig = patch.field
          ? { ...c.field, ...patch.field }
          : c.field;
        if (patch.physical) {
          const inferredBiz = inferBusinessType(nextPhys.type);
          const bizIsAuto = c.field.business_type === inferBusinessType(c.physical.type);
          nextField.business_type = bizIsAuto ? inferredBiz : c.field.business_type;
          nextField.required = nextPhys.notnull;
          if (nextPhys.pk) nextField.editable = false;
        }
        if (patch.physical?.name !== undefined) {
          nextField.physical = nextPhys.name;
          if (!c.field.key || c.field.key === c.physical.name) {
            nextField.key = nextPhys.name;
          }
        }
        return { ...c, physical: nextPhys, field: nextField };
      }),
    );
  };

  const removeCol = (uid: string) => {
    setColumns((prev) => prev.filter((c) => c.uid !== uid));
  };

  const addCol = () => {
    setColumns((prev) => {
      const idx = prev.length;
      const phys: PhysicalInfo = {
        name: "",
        type: "TEXT",
        notnull: false,
        pk: false,
        default: "",
      };
      return [...prev, makeCol(phys, idx)];
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setError("表名必须以字母或下划线开头,只能包含字母数字下划线");
      return;
    }
    if (columns.length === 0) {
      setError("至少添加一个字段");
      return;
    }
    const seen = new Set<string>();
    for (const c of columns) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.physical.name)) {
        setError(`字段名不合法: ${c.physical.name || "(空)"}`);
        return;
      }
      if (seen.has(c.physical.name)) {
        setError(`字段名重复: ${c.physical.name}`);
        return;
      }
      seen.add(c.physical.name);
    }
    const pks = columns.filter((c) => c.physical.pk);
    if (pks.length === 0) {
      setError("请至少勾选一个主键字段");
      return;
    }
    setSubmitting(true);
    try {
      const finalName = name.trim();
      const finalLabel = label.trim() || humanize(finalName);
      const fields: FieldConfig[] = columns.map((c, idx) => ({
        ...c.field,
        key: c.field.key.trim() || c.physical.name,
        physical: c.physical.name,
        sort: idx,
      }));
      const primaryKey = pks[0]?.physical.name ?? "id";
      await onSubmit({
        table: {
          name: finalName,
          columns: columns.map((c) => ({
            name: c.physical.name,
            type: c.physical.type,
            notnull: c.physical.notnull,
            pk: c.physical.pk,
            default: c.physical.default,
          })),
        },
        model: {
          label: finalLabel,
          description: description.trim(),
          config: {
            root_alias: finalName,
            tables: [
              {
                alias: finalName,
                physical: finalName,
                label: finalLabel,
                primary_key: primaryKey,
                fields,
              },
            ],
            relations: [],
          },
        },
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建表"
      description="填写表名、字段物理结构与业务类型,创建后即可录入数据并自动生成增删改查接口"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {columns.length} 个字段 · 一次保存,统一生效
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "创建中…" : "创建"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">表名 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_table"
              className="h-8 text-sm"
              autoFocus
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              展示名(可选)
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="我的表"
              className="h-8 text-sm"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              说明(可选)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              onClick={addCol}
              disabled={submitting}
            >
              <Plus className="size-3" />
              添加字段
            </Button>
          </header>
          {columns.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              暂无字段,点击右上「添加字段」开始
            </p>
          ) : (
            <ul className="space-y-2">
              {columns.map((c) => (
                <FieldEditorRow
                  key={c.uid}
                  physical={c.physical}
                  field={c.field}
                  businessTypes={businessTypes}
                  physicalEditable
                  onPhysicalChange={(patch) => updateCol(c.uid, { physical: patch })}
                  onFieldChange={(patch) => updateCol(c.uid, { field: patch })}
                  onRemove={() => removeCol(c.uid)}
                  canRemove={!c.physical.pk}
                  submitting={submitting}
                  isNew
                />
              ))}
            </ul>
          )}
        </section>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
