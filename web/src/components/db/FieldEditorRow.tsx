import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BusinessType,
  BusinessTypeInfo,
  FieldConfig,
  SelectOption,
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
            {field.business_type === "date" ||
            field.business_type === "datetime" ? (
              <DateDefaultControl
                value={field.default ?? ""}
                businessType={field.business_type}
                disabled={submitting}
                onChange={(v) => onFieldChange({ default: v })}
              />
            ) : null}
          </div>

          {field.business_type === "select" || field.business_type === "multiselect" ? (
            <OptionsEditor
              options={field.options ?? []}
              disabled={submitting}
              onChange={(options) => onFieldChange({ options })}
            />
          ) : null}
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

type DateDefaultMode = "" | "now" | "fixed";

function parseDateDefault(raw: string): DateDefaultMode {
  if (raw === "") return "";
  if (raw === "now") return "now";
  return "fixed";
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

function dateTimeLocalToBackend(value: string): string {
  // HTML datetime-local 形如 "YYYY-MM-DDTHH:MM"；把 T 换成空格,并补 :00 秒,
  // 适配后端 validateFieldDefault 接受的 "YYYY-MM-DD HH:MM:SS"。
  return value.replace("T", " ") + (value.length === 16 ? ":00" : "");
}

interface DateDefaultControlProps {
  value: string;
  businessType: "date" | "datetime";
  disabled?: boolean;
  onChange: (v: string) => void;
}

function DateDefaultControl({
  value,
  businessType,
  disabled,
  onChange,
}: DateDefaultControlProps) {
  const mode = parseDateDefault(value);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground">默认值</span>
      <select
        value={mode}
        onChange={(e) => {
          const m = e.target.value as DateDefaultMode;
          if (m === "") onChange("");
          else if (m === "now") onChange("now");
          else {
            // 切到「固定值」时给一个默认填值,避免空串被当成无默认。
            if (businessType === "date") onChange(nowAsDateString());
            else onChange(dateTimeLocalToBackend(nowAsDateTimeLocalString()));
          }
        }}
        className="h-7 rounded-md border bg-transparent px-2 text-xs"
        disabled={disabled}
      >
        <option value="">无</option>
        <option value="now">当前时间</option>
        <option value="fixed">固定值</option>
      </select>
      {mode === "fixed" ? (
        <Input
          type={businessType === "date" ? "date" : "datetime-local"}
          value={
            businessType === "date"
              ? value
              : value.replace(" ", "T").slice(0, 16)
          }
          onChange={(e) => {
            const raw = e.target.value;
            if (businessType === "date") onChange(raw);
            else onChange(raw ? dateTimeLocalToBackend(raw) : "");
          }}
          className="h-7 w-40 text-xs"
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

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

interface OptionsEditorProps {
  options: SelectOption[];
  disabled?: boolean;
  onChange: (options: SelectOption[]) => void;
}

function OptionsEditor({ options, disabled, onChange }: OptionsEditorProps) {
  const list = options ?? [];
  const update = (idx: number, patch: Partial<SelectOption>) => {
    const next = list.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(list.filter((_, i) => i !== idx));
  };
  const add = () => {
    onChange([...list, { label: "", value: "" }]);
  };
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">下拉列表</span>
          <span>· 配置插入值与展示值</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={add}
        >
          <Plus className="size-3" />
          新增选项
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="rounded border border-dashed bg-background/60 px-2 py-2 text-center text-[11px] text-muted-foreground">
          尚未配置选项,点击右上「新增选项」添加
        </p>
      ) : (
        <ul className="space-y-1">
          {list.map((o, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <span className="w-6 text-right font-mono text-[10px] text-muted-foreground">
                {idx + 1}
              </span>
              <Input
                value={o.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="展示值"
                className="h-7 flex-1 text-xs"
                disabled={disabled}
              />
              <Input
                value={o.value}
                onChange={(e) => update(idx, { value: e.target.value })}
                placeholder="插入值"
                className="h-7 flex-1 font-mono text-xs"
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`删除选项 ${idx + 1}`}
                disabled={disabled}
                onClick={() => remove(idx)}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
