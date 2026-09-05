import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createPage,
  deletePage,
  listModels as listModelsApi,
  listPageIcons,
  listPages,
  updatePage,
} from "@/lib/api";
import type { Page, PageInput } from "@/features/pages/types";
import type { ModelSummary } from "@/features/logicmodels/types";
import { cn } from "@/lib/utils";

interface PagesListProps {
  onOpenPage?: (page: Page) => void;
  initialEdit?: Page | null;
  onEditConsumed?: () => void;
}

export function PagesList({
  onOpenPage,
  initialEdit,
  onEditConsumed,
}: PagesListProps) {
  const [items, setItems] = useState<Page[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Page | null>(null);
  const [creating, setCreating] = useState<{ parentId: string } | null>(null);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [icons, setIcons] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, iconList, modelList] = await Promise.all([
        listPages(),
        listPageIcons(),
        listModelsApi(),
      ]);
      setItems(list);
      setIcons(iconList);
      setModels(modelList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (initialEdit) {
      setEditing(initialEdit);
      onEditConsumed?.();
    }
  }, [initialEdit, onEditConsumed]);

  const tree = useMemo(() => buildTree(items ?? []), [items]);
  const isEmpty = !loading && (items?.length ?? 0) === 0;

  const onDelete = async (id: string, label: string) => {
    if (!confirm(`删除页面 "${label}" 吗?子页面会一并删除`)) return;
    try {
      await deletePage(id);
      toast.success("已删除");
      if (editing?.id === id) setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="size-3.5" />
          页面配置
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setCreating({ parentId: "" })}
        >
          <Plus className="size-3" />
          新建顶级页面
        </Button>
      </div>

      {loading ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" /> 加载中…
        </p>
      ) : isEmpty ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center">
          <Sparkles className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-xs font-medium">还没有配置任何页面</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            新建一个页面,关联到逻辑模型,即可在底部导航栏里访问。
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {tree.map((node) => (
            <li key={node.page.id}>
              <PageRow
                page={node.page}
                models={models}
                onOpen={() => onOpenPage?.(node.page)}
                onEdit={() => setEditing(node.page)}
                onDelete={() => void onDelete(node.page.id, node.page.label)}
                onAddChild={() => setCreating({ parentId: node.page.id })}
              />
              {node.children.length > 0 ? (
                <ul className="ml-4 mt-1 space-y-1 border-l pl-3">
                  {node.children.map((child) => (
                    <li key={child.id}>
                      <PageRow
                        page={child}
                        models={models}
                        onOpen={() => onOpenPage?.(child)}
                        onEdit={() => setEditing(child)}
                        onDelete={() => void onDelete(child.id, child.label)}
                        onAddChild={null}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {(editing || creating) && (
        <PageEditorDialog
          open
          initial={editing}
          parentId={creating?.parentId ?? editing?.parent_id ?? ""}
          models={models}
          icons={icons}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

interface PageRowProps {
  page: Page;
  models: ModelSummary[];
  onOpen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: (() => void) | null;
}

function PageRow({
  page,
  models,
  onOpen,
  onEdit,
  onDelete,
  onAddChild,
}: PageRowProps) {
  const modelLabel = models.find((m) => m.slug === page.model_slug)?.label;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          /{page.slug}
        </span>
        <span className="truncate">{page.label}</span>
        {page.parent_id ? null : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            顶级
          </span>
        )}
        {page.model_slug ? (
          <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            → {modelLabel ?? page.model_slug}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onOpen ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onOpen}
            aria-label="进入页面"
            title="进入页面"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        ) : null}
        {onAddChild ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onAddChild}
            aria-label="新增子页面"
            title="新增子页面"
          >
            <Plus className="size-3" />
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onEdit}
          aria-label="编辑页面"
          title="编辑页面"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onDelete}
          aria-label="删除页面"
          title="删除页面"
        >
          <Trash2 className="size-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

interface PageEditorDialogProps {
  open: boolean;
  initial: Page | null;
  parentId: string;
  models: ModelSummary[];
  icons: string[];
  onClose: () => void;
  onSaved: () => void;
}

function PageEditorDialog({
  open,
  initial,
  parentId,
  models,
  icons,
  onClose,
  onSaved,
}: PageEditorDialogProps) {
  const isEdit = !!initial;
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "LayoutDashboard");
  const [modelSlug, setModelSlug] = useState(initial?.model_slug ?? "");
  const [sort, setSort] = useState<string>(
    initial?.sort != null ? String(initial.sort) : "0",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSlug(initial?.slug ?? "");
    setLabel(initial?.label ?? "");
    setIcon(initial?.icon ?? "LayoutDashboard");
    setModelSlug(initial?.model_slug ?? "");
    setSort(initial?.sort != null ? String(initial.sort) : "0");
    setError(null);
  }, [open, initial]);

  const submit = async () => {
    setError(null);
    if (!/^[a-z][a-z0-9_-]*$/.test(slug)) {
      setError("slug 必须以小写字母开头,只能包含小写字母、数字、下划线、连字符");
      return;
    }
    if (!label.trim()) {
      setError("展示名不能为空");
      return;
    }
    setSubmitting(true);
    try {
      const input: PageInput = {
        slug: slug.trim(),
        label: label.trim(),
        icon,
        parent_id: parentId,
        model_slug: modelSlug,
        sort: Number(sort) || 0,
      };
      if (isEdit && initial) {
        await updatePage(initial.id, input);
      } else {
        await createPage(input);
      }
      toast.success(isEdit ? "已保存" : "已新建");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={isEdit ? "编辑页面" : parentId ? "新建子页面" : "新建顶级页面"}
      description="每个页面可关联一个逻辑模型,进入即展示其数据并支持增删改查与筛选"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">slug(URL 段)</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="home"
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">展示名</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="首页"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">关联模型(可选)</label>
            <select
              value={modelSlug}
              onChange={(e) => setModelSlug(e.target.value)}
              className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
            >
              <option value="">不关联(仅作导航占位)</option>
              {models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label} ({m.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">排序</label>
            <Input
              type="number"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">图标</label>
          <div className="grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
            {icons.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => setIcon(name)}
                className={cn(
                  "flex h-8 w-full items-center justify-center rounded text-[10px] font-mono",
                  icon === name
                    ? "bg-foreground text-background"
                    : "bg-background hover:bg-muted",
                )}
              >
                {name.slice(0, 4)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            当前: <code className="font-mono">{icon}</code>
          </p>
        </div>
        {parentId ? (
          <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            将作为子页面挂在父级下,系统仅支持最多两级结构。
          </div>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

interface TreeNode {
  page: Page;
  children: Page[];
}

function buildTree(pages: Page[]): TreeNode[] {
  const byParent = new Map<string, Page[]>();
  for (const p of pages) {
    const key = p.parent_id || "";
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  }
  const tops = byParent.get("") ?? [];
  return tops.map((p) => ({
    page: p,
    children: byParent.get(p.id) ?? [],
  }));
}
