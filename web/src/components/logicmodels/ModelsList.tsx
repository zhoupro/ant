import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Database,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  deleteModel,
  getModel,
  listModels,
} from "@/lib/api";
import type { ModelConfig, ModelSummary } from "@/features/logicmodels/types";

import { ModelEditor } from "./ModelEditor";
import { ModelRuntime } from "./ModelRuntime";

interface ModelsListProps {
  onGoToDB: () => void;
}

export function ModelsList({ onGoToDB }: ModelsListProps) {
  const [items, setItems] = useState<ModelSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<
    | {
        slug: string;
        label: string;
        description: string;
        config: ModelConfig;
      }
    | undefined
  >(undefined);
  const [creating, setCreating] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listModels();
      setItems(list);
      if (activeSlug && !list.some((m) => m.slug === activeSlug)) {
        setActiveSlug(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEdit = async (slug: string) => {
    try {
      const m = await getModel(slug);
      const cfg = JSON.parse(m.config) as ModelConfig;
      setEditing({
        slug: m.slug,
        label: m.label,
        description: m.description,
        config: cfg,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    }
  };

  const handleDelete = async (slug: string, label: string) => {
    if (!confirm(`确定删除逻辑模型 "${label}" 吗?`)) return;
    try {
      await deleteModel(slug);
      toast.success("已删除");
      if (activeSlug === slug) setActiveSlug(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const onSaved = async (_slug: string) => {
    await refresh();
  };

  if (activeSlug) {
    return (
      <ModelRuntime
        slug={activeSlug}
        onBack={() => setActiveSlug(null)}
        onEdit={() => void handleEdit(activeSlug)}
        onDeleted={() => {
          setActiveSlug(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <Card className="w-full max-w-3xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-foreground/70" />
            逻辑模型
          </CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            新建模型
          </Button>
        </div>
        <CardDescription>
          从受管数据库中拉取表,配置字段业务类型与关系,自动生成增删改查接口与界面
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && items === null ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
            加载中…
          </p>
        ) : items && items.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
            {items.map((m) => (
              <li
                key={m.slug}
                className="flex items-center gap-2 px-3 py-2.5"
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => setActiveSlug(m.slug)}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.slug}
                  </span>
                  <span className="font-medium">{m.label}</span>
                  {m.description ? (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      · {m.description}
                    </span>
                  ) : null}
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="编辑"
                  onClick={() => void handleEdit(m.slug)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="删除"
                  onClick={() => void handleDelete(m.slug, m.label)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center">
            <Database className="mx-auto size-5 text-muted-foreground" />
            <p className="text-sm font-medium">还没有逻辑模型</p>
            <p className="text-xs text-muted-foreground">
              新建模型前,请先在「数据库」标签中创建表,再回到此处拉取与配置
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={onGoToDB}>
                <Database className="size-3.5" />
                去创建表
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                新建模型
              </Button>
            </div>
          </div>
        )}

        <Separator />

        <p className="text-[11px] text-muted-foreground">
          点击模型即可使用自动生成的界面。点击编辑按钮可修改字段业务类型、关系等配置。
        </p>
      </CardContent>

      {(creating || editing) && (
        <ModelEditor
          open
          onOpenChange={(v) => {
            if (!v) {
              setCreating(false);
              setEditing(undefined);
            }
          }}
          {...(editing ? { initial: editing } : {})}
          onSaved={onSaved}
        />
      )}
    </Card>
  );
}