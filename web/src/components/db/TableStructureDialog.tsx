import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addColumn, dropColumn, getTableSchema } from "@/lib/api";
import type { AddColumnInput, Column } from "@/features/db/types";
import { cn } from "@/lib/utils";

interface TableStructureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  onChanged?: () => void;
}

const TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC", "BOOLEAN"] as const;

export function TableStructureDialog({
  open,
  onOpenChange,
  tableName,
  onChanged,
}: TableStructureDialogProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<typeof TYPES[number]>("TEXT");
  const [notnull, setNotnull] = useState(false);
  const [defaultVal, setDefaultVal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getTableSchema(tableName);
      setColumns(s.columns);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "读取表结构失败");
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    setName("");
    setType("TEXT");
    setNotnull(false);
    setDefaultVal("");
    setError(null);
    setPendingDelete(null);
  }, [open, refresh]);

  const handleAdd = async () => {
    setError(null);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setError("字段名必须以字母或下划线开头,只能包含字母数字下划线");
      return;
    }
    if (columns.some((c) => c.name === name)) {
      setError("字段名已存在");
      return;
    }
    setSubmitting(true);
    try {
      const input: AddColumnInput = {
        name,
        type,
        notnull,
        default: defaultVal.trim(),
      };
      await addColumn(tableName, input);
      toast.success(`已添加 ${name}`);
      setName("");
      setDefaultVal("");
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (column: string) => {
    setSubmitting(true);
    try {
      await dropColumn(tableName, column);
      toast.success(`已删除 ${column}`);
      setPendingDelete(null);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`编辑表结构 · ${tableName}`}
      description="增删字段,主键字段不可删除"
      size="lg"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <header className="flex items-center justify-between">
            <h4 className="text-sm font-medium">已有字段</h4>
            <span className="text-xs text-muted-foreground">
              {columns.length} 个
            </span>
          </header>
          {loading ? (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </div>
          ) : columns.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              暂无字段
            </p>
          ) : (
            <ul className="space-y-1">
              {columns.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.type || "ANY"}
                    </span>
                    {c.pk ? (
                      <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px]">主键</span>
                    ) : null}
                    {c.notnull ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">NOT NULL</span>
                    ) : null}
                    {c.default ? (
                      <span className="text-[10px] text-muted-foreground">
                        default: {c.default}
                      </span>
                    ) : null}
                  </div>
                  {c.pk ? (
                    <span className="text-[10px] text-muted-foreground">主键不可删</span>
                  ) : pendingDelete === c.name ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={submitting}
                        onClick={() => void handleDelete(c.name)}
                      >
                        确认删除
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={submitting}
                        onClick={() => setPendingDelete(null)}
                      >
                        取消
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={submitting}
                      onClick={() => setPendingDelete(c.name)}
                      aria-label={`删除字段 ${c.name}`}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <header className="flex items-center gap-1 text-sm font-medium">
            <Plus className="size-3.5" /> 新增字段
          </header>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">字段名</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new_column"
                className="h-8 text-sm"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof TYPES[number])}
                disabled={submitting}
                className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] text-muted-foreground">默认值(可选)</label>
              <Input
                value={defaultVal}
                onChange={(e) => setDefaultVal(e.target.value)}
                placeholder="可空,例如 'hello' 或 0"
                className="h-8 text-sm"
                disabled={submitting}
              />
            </div>
          </div>
          <label className={cn("flex items-center gap-2 text-xs")}>
            <input
              type="checkbox"
              checked={notnull}
              onChange={(e) => setNotnull(e.target.checked)}
              disabled={submitting}
            />
            NOT NULL
          </label>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={submitting || !name}
              onClick={() => void handleAdd()}
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              添加
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}