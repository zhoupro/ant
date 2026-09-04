import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Column } from "@/features/db/types";

interface RowEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "insert" | "update";
  columns: Column[];
  initial?: Record<string, unknown>;
  primaryKeys: string[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

export function RowEditor({
  open,
  onOpenChange,
  mode,
  columns,
  initial,
  primaryKeys,
  onSubmit,
}: RowEditorProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editableCols = useMemo(
    () =>
      columns.filter(
        (c) =>
          !(mode === "update" && primaryKeys.includes(c.name)) &&
          !isAutoIncrement(c)
      ),
    [columns, mode, primaryKeys]
  );

  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    for (const c of editableCols) {
      const v = initial?.[c.name];
      if (v === null || v === undefined) {
        seed[c.name] = "";
      } else if (typeof v === "object") {
        seed[c.name] = JSON.stringify(v);
      } else {
        seed[c.name] = String(v);
      }
    }
    setValues(seed);
    setError(null);
  }, [open, editableCols, initial]);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const c of editableCols) {
        const raw = values[c.name];
        if (raw === "" || raw === undefined) {
          if (mode === "insert" && c.notnull && !c.default) {
            throw new Error(`字段 ${c.name} 不能为空`);
          }
          continue;
        }
        payload[c.name] = coerce(raw, c);
      }
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "insert" ? "新增记录" : "编辑记录"}
      description={
        mode === "insert"
          ? "填写各字段值,留空将使用 NULL 或默认值"
          : "修改字段值,主键不可修改"
      }
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "提交中…" : mode === "insert" ? "新增" : "保存"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {editableCols.map((c) => (
          <div key={c.name} className="space-y-1">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{c.name}</span>
              <span className="font-mono text-[10px]">[{c.type || "ANY"}]</span>
              {c.notnull ? (
                <span className="text-destructive">*</span>
              ) : null}
              {c.pk ? (
                <span className="text-[10px] text-muted-foreground">PK</span>
              ) : null}
            </label>
            <Input
              value={values[c.name] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [c.name]: e.target.value }))
              }
              placeholder={
                c.default ? `默认: ${c.default}` : c.notnull ? "必填" : "可空"
              }
            />
          </div>
        ))}
        {editableCols.length === 0 ? (
          <div className="text-sm text-muted-foreground sm:col-span-2">
            没有可编辑的字段
          </div>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

function isAutoIncrement(c: Column): boolean {
  return /\bINTEGER\s+PRIMARY\s+KEY\b/i.test(`${c.type} ${c.name}`) && c.pk
}

function coerce(raw: string, c: Column): unknown {
  const t = (c.type || "").toUpperCase()
  if (raw === "NULL") return null
  if (t.includes("INT")) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return raw
    return Number.isInteger(n) ? Math.trunc(n) : n
  }
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUB")) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  if (t.includes("BOOL")) {
    if (raw === "true" || raw === "1") return true
    if (raw === "false" || raw === "0") return false
    return raw
  }
  return raw
}