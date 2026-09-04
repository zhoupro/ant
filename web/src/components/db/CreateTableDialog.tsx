import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CreateTableInput } from "@/features/db/types";

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateTableInput) => Promise<void>;
}

const TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC", "BOOLEAN"] as const;

interface DraftCol {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default: string;
}

const emptyCol = (): DraftCol => ({
  name: "",
  type: "TEXT",
  notnull: false,
  pk: false,
  default: "",
});

export function CreateTableDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateTableDialogProps) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<DraftCol[]>([
    { name: "id", type: "INTEGER", notnull: true, pk: true, default: "" },
    { name: "name", type: "TEXT", notnull: true, pk: false, default: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCol = (idx: number, patch: Partial<DraftCol>) => {
    setColumns((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  };

  const removeCol = (idx: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== idx));
  };

  const addCol = () => {
    setColumns((prev) => [...prev, emptyCol()]);
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error("表名必须是合法的标识符");
      }
      if (columns.length === 0) {
        throw new Error("至少添加一个字段");
      }
      const seen = new Set<string>();
      for (const c of columns) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) {
          throw new Error(`字段名不合法: ${c.name}`);
        }
        if (seen.has(c.name)) throw new Error(`字段名重复: ${c.name}`);
        seen.add(c.name);
      }
      await onSubmit({
        name,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type,
          notnull: c.notnull,
          pk: c.pk,
          default: c.default,
        })),
      });
      onOpenChange(false);
      setName("");
      setColumns([
        { name: "id", type: "INTEGER", notnull: true, pk: true, default: "" },
        { name: "name", type: "TEXT", notnull: true, pk: false, default: "" },
      ]);
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
      description="定义表名与字段,创建后即可录入数据"
      size="lg"
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
            {submitting ? "创建中…" : "创建"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">表名</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my_table"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">字段</label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={addCol}
            >
              <Plus className="size-3" />
              添加字段
            </Button>
          </div>
          <div className="space-y-2">
            {columns.map((c, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2"
              >
                <Input
                  value={c.name}
                  onChange={(e) => updateCol(idx, { name: e.target.value })}
                  placeholder="字段名"
                  className="h-7 w-32"
                />
                <select
                  value={c.type}
                  onChange={(e) => updateCol(idx, { type: e.target.value })}
                  className="h-7 rounded-md border bg-transparent px-2 text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={c.notnull}
                    onChange={(e) =>
                      updateCol(idx, { notnull: e.target.checked })
                    }
                  />
                  NOT NULL
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={c.pk}
                    onChange={(e) => updateCol(idx, { pk: e.target.checked })}
                  />
                  主键
                </label>
                <Input
                  value={c.default}
                  onChange={(e) => updateCol(idx, { default: e.target.value })}
                  placeholder="默认值"
                  className="h-7 w-28"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeCol(idx)}
                  aria-label="删除字段"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}