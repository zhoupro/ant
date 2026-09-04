import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AddColumnInput } from "@/features/db/types";

interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AddColumnInput) => Promise<void>;
}

const TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC", "BOOLEAN"] as const;

export function AddColumnDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddColumnDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("TEXT");
  const [notnull, setNotnull] = useState(false);
  const [defaultVal, setDefaultVal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setType("TEXT");
    setNotnull(false);
    setDefaultVal("");
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error("字段名不合法");
      }
      await onSubmit({
        name,
        type,
        notnull,
        default: defaultVal.trim(),
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="新增字段"
      description="为当前表追加一列"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "添加中…" : "添加"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">字段名</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="new_column"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">类型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">默认值</label>
          <Input
            value={defaultVal}
            onChange={(e) => setDefaultVal(e.target.value)}
            placeholder="可空"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notnull}
            onChange={(e) => setNotnull(e.target.checked)}
          />
          NOT NULL
        </label>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}