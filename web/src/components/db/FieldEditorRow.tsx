import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BusinessType,
  BusinessTypeInfo,
  FieldConfig,
} from "@/features/logicmodels/types";
import { cn } from "@/lib/utils";

export interface PhysicalInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default: string;
}

export interface FieldEditorRowProps {
  physical: PhysicalInfo;
  physicalEditable?: boolean;
  onPhysicalChange?: (patch: Partial<PhysicalInfo>) => void;

  field: FieldConfig;
  businessTypes: BusinessTypeInfo[];
  onFieldChange: (patch: Partial<FieldConfig>) => void;

  isNew?: boolean;

  onRemove: () => void;
  pendingDelete?: boolean;
  onAskDelete?: () => void;
  onCancelDelete?: () => void;
  canRemove?: boolean;

  submitting?: boolean;
}

export function FieldEditorRow({
  physical,
  physicalEditable = false,
  onPhysicalChange,
  field,
  businessTypes,
  onFieldChange,
  isNew = false,
  onRemove,
  pendingDelete = false,
  onAskDelete,
  onCancelDelete,
  canRemove = true,
  submitting = false,
}: FieldEditorRowProps) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {physicalEditable && onPhysicalChange ? (
              <>
                <Input
                  value={physical.name}
                  onChange={(e) =>
                    onPhysicalChange({
                      name: e.target.value.replace(/\s+/g, "_"),
                    })
                  }
                  placeholder="字段名"
                  className="h-7 w-28 font-mono text-xs"
                  disabled={submitting || physical.pk}
                />
                <select
                  value={physical.type}
                  onChange={(e) => onPhysicalChange({ type: e.target.value })}
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
                  disabled={submitting}
                >
                  {PHYSICAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={physical.notnull}
                    onChange={(e) =>
                      onPhysicalChange({ notnull: e.target.checked })
                    }
                    disabled={submitting}
                  />
                  NOT NULL
                </label>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={physical.pk}
                    onChange={(e) =>
                      onPhysicalChange({ pk: e.target.checked })
                    }
                    disabled={submitting}
                  />
                  主键
                </label>
                <Input
                  value={physical.default}
                  onChange={(e) =>
                    onPhysicalChange({ default: e.target.value })
                  }
                  placeholder="默认值"
                  className="h-7 w-24 text-xs"
                  disabled={submitting}
                />
              </>
            ) : (
              <>
                <span className="font-mono text-sm">{physical.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {physical.type || "ANY"}
                </span>
                {physical.pk ? (
                  <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px]">
                    主键
                  </span>
                ) : null}
                {physical.notnull ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    NOT NULL
                  </span>
                ) : null}
              </>
            )}
            {isNew ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                新增
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={field.label}
              onChange={(e) => onFieldChange({ label: e.target.value })}
              placeholder="展示名"
              className="h-7 w-28 text-xs"
              disabled={submitting}
            />
            <select
              value={field.business_type}
              onChange={(e) =>
                onFieldChange({ business_type: e.target.value as BusinessType })
              }
              className="h-7 rounded-md border bg-transparent px-2 text-xs"
              disabled={submitting}
            >
              {businessTypes.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <FlagToggle
              active={field.list_show}
              disabled={submitting}
              onChange={(v) => onFieldChange({ list_show: v })}
              label="列表"
            />
            <FlagToggle
              active={field.searchable}
              disabled={submitting}
              onChange={(v) => onFieldChange({ searchable: v })}
              label="可搜索"
            />
            <FlagToggle
              active={field.editable}
              disabled={submitting || physical.pk}
              onChange={(v) => onFieldChange({ editable: v })}
              label="可编辑"
            />
            <FlagToggle
              active={field.required}
              disabled={submitting}
              onChange={(v) => onFieldChange({ required: v })}
              label="必填"
            />
            <Input
              value={field.placeholder ?? ""}
              onChange={(e) => onFieldChange({ placeholder: e.target.value })}
              placeholder="提示"
              className="h-7 w-24 text-xs"
              disabled={submitting}
            />
          </div>
        </div>
        {!canRemove ? (
          <span className="shrink-0 self-center text-[10px] text-muted-foreground">
            主键不可删
          </span>
        ) : pendingDelete && onAskDelete && onCancelDelete ? (
          <div className="flex shrink-0 items-center gap-1 self-center">
            <Button
              size="xs"
              variant="destructive"
              disabled={submitting}
              onClick={onRemove}
            >
              确认删除
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={submitting}
              onClick={onCancelDelete}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 self-center"
            disabled={submitting}
            onClick={onAskDelete ?? onRemove}
            aria-label={`删除字段 ${physical.name}`}
          >
            <Trash2 className="size-3 text-destructive" />
          </Button>
        )}
      </div>
    </li>
  );
}

const PHYSICAL_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BLOB",
  "NUMERIC",
  "BOOLEAN",
];

interface FlagToggleProps {
  active: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

function FlagToggle({ active, onChange, label, disabled }: FlagToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!active)}
      disabled={disabled}
      className={cn(
        "h-7 rounded-md border px-2 text-xs",
        disabled
          ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground opacity-60"
          : active
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-dashed bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
