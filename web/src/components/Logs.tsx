import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Filter,
  Info,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
  UploadCloud,
  X,
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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  absoluteUrl,
  clearLogs,
  createLog,
  deleteLog,
  formatBytes,
  formatDateTime,
  getLogFacets,
  hasPermission,
  listLogs,
  uploadFile,
} from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import type { LogEntry, LogImage } from "@/features/logs/types";
import type { AuthUser } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const LEVEL_OPTIONS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVEL_OPTIONS)[number];

const LEVEL_LABEL: Record<Level, string> = {
  debug: "调试",
  info: "信息",
  warn: "警告",
  error: "错误",
};

const LEVEL_CLASS: Record<Level, string> = {
  debug: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

const DEFAULT_LIMIT = 20;

interface LogsProps {
  user: AuthUser;
}

export function Logs({ user }: LogsProps) {
  const canManage = hasPermission(user, "manage_logs");
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<string[]>([...LEVEL_OPTIONS]);
  const [sources, setSources] = useState<string[]>([]);

  const [levelFilter, setLevelFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [preview, setPreview] = useState<LogImage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listLogs({
        level: (levelFilter || undefined) as Level | undefined,
        source: sourceFilter || undefined,
        search: search || undefined,
        limit,
        offset,
        order: "desc",
      });
      setItems(resp.items);
      setTotal(resp.total);
      setLevels(resp.levels.length ? resp.levels : [...LEVEL_OPTIONS]);
      setSources(resp.sources);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载日志失败");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, sourceFilter, search, limit, offset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 后台拉一次 facets 用于"来源"下拉框的初始值,即便当前过滤把它过滤掉也能选回。
  useEffect(() => {
    void (async () => {
      try {
        const facets = await getLogFacets();
        if (facets.levels.length) setLevels(facets.levels);
        setSources(facets.sources);
      } catch {
        // ignore
      }
    })();
  }, []);

  const submitSearch = useCallback(() => {
    setOffset(0);
    setSearch(searchInput.trim());
  }, [searchInput]);

  const resetFilters = useCallback(() => {
    setLevelFilter("");
    setSourceFilter("");
    setSearchInput("");
    setSearch("");
    setOffset(0);
  }, []);

  const onDelete = useCallback(
    async (entry: LogEntry) => {
      if (!confirm(`确定删除日志「${entry.title}」?`)) return;
      try {
        await deleteLog(entry.id);
        toast.success("已删除");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "删除失败");
      }
    },
    [refresh],
  );

  const onClearAll = useCallback(async () => {
    if (
      !confirm(
        `确定清空全部 ${total} 条日志吗?此操作无法撤销。`,
      )
    )
      return;
    try {
      await clearLogs();
      toast.success("已清空全部日志");
      setOffset(0);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "清空失败");
    }
  }, [total, refresh]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <Card className="w-full max-w-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4 text-foreground/70" />
          日志管理
        </CardTitle>
        <CardDescription>
          在线查看 / 记录系统日志,支持附加图片方便查看现场截图。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar
          levels={levels}
          sources={sources}
          levelFilter={levelFilter}
          sourceFilter={sourceFilter}
          searchInput={searchInput}
          onLevelChange={(v) => {
            setOffset(0);
            setLevelFilter(v);
          }}
          onSourceChange={(v) => {
            setOffset(0);
            setSourceFilter(v);
          }}
          onSearchChange={setSearchInput}
          onSubmitSearch={submitSearch}
          onReset={resetFilters}
          canManage={canManage}
          onCreate={() => setCreateOpen(true)}
          onClearAll={onClearAll}
          total={total}
        />

        <Separator />

        {items.length === 0 ? (
          <EmptyState loading={loading} hasFilter={Boolean(levelFilter || sourceFilter || search)} />
        ) : (
          <ul className="space-y-3">
            {items.map((entry) => (
              <LogCard
                key={entry.id}
                entry={entry}
                canManage={canManage}
                onPreview={setPreview}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={total}
          limit={limit}
          offset={offset}
          loading={loading}
          onChange={(next) => setOffset(next)}
        />
      </CardContent>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        title={preview?.original_name}
        description={
          preview
            ? `${formatBytes(preview.size)} · ${formatDateTime(preview.created_at)}`
            : undefined
        }
        size="lg"
        className="max-w-4xl"
        footer={
          preview ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await copyToClipboard(absoluteUrl(preview.url));
                  if (ok) toast.success("链接已复制");
                  else toast.error("复制失败，请手动复制");
                }}
              >
                <Copy className="size-3.5" />
                复制链接
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                <X className="size-3.5" />
                关闭
              </Button>
            </>
          ) : null
        }
      >
        {preview && (
          <div className="flex items-center justify-center rounded-md bg-muted/40 overflow-hidden">
            <img
              src={absoluteUrl(preview.url)}
              alt={preview.original_name}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          </div>
        )}
      </Dialog>

      <CreateLogDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sources={sources}
        onCreated={() => {
          setOffset(0);
          void refresh();
        }}
      />
    </Card>
  );
}

function FilterBar(props: {
  levels: string[];
  sources: string[];
  levelFilter: string;
  sourceFilter: string;
  searchInput: string;
  total: number;
  loading?: boolean;
  canManage: boolean;
  onLevelChange: (v: string) => void;
  onSourceChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onSubmitSearch: () => void;
  onReset: () => void;
  onCreate: () => void;
  onClearAll: () => void;
}) {
  const {
    levels,
    sources,
    levelFilter,
    sourceFilter,
    searchInput,
    total,
    canManage,
    onLevelChange,
    onSourceChange,
    onSearchChange,
    onSubmitSearch,
    onReset,
    onCreate,
    onClearAll,
  } = props;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">级别</label>
          <select
            value={levelFilter}
            onChange={(e) => onLevelChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <option value="">全部</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[(l as Level)] ?? l}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">来源</label>
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <option value="">全部</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-1 min-w-[12rem]">
          <label className="text-[11px] text-muted-foreground">关键字</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitSearch();
            }}
            className="flex gap-1"
          >
            <Input
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索标题或消息"
              className="h-8"
            />
            <Button type="submit" size="sm">
              <Filter className="size-3.5" />
              筛选
            </Button>
          </form>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={onReset}>
            重置筛选
          </Button>
          {canManage && (
            <>
              <Button size="xs" variant="ghost" onClick={onClearAll}>
                <Trash2 className="size-3" />
                清空全部
              </Button>
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-3.5" />
                新建日志
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LogCard(props: {
  entry: LogEntry;
  canManage: boolean;
  onPreview: (img: LogImage) => void;
  onDelete: (entry: LogEntry) => void;
}) {
  const { entry, canManage, onPreview, onDelete } = props;
  const level = (LEVEL_OPTIONS as readonly string[]).includes(entry.level)
    ? (entry.level as Level)
    : "info";
  return (
    <li className="rounded-lg ring-1 ring-foreground/10 bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            LEVEL_CLASS[level],
          )}
        >
          {LEVEL_LABEL[level]}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
          {entry.source || "manual"}
        </span>
        {entry.method ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            {entry.method} {entry.path}
          </span>
        ) : null}
        {typeof entry.status_code === "number" ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-mono",
              entry.status_code >= 500
                ? "bg-rose-100 text-rose-700"
                : entry.status_code >= 400
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700",
            )}
          >
            {entry.status_code}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatDateTime(entry.created_at)}
          {typeof entry.duration_ms === "number"
            ? ` · ${entry.duration_ms}ms`
            : ""}
        </span>
      </div>
      <div className="mt-1.5 text-sm font-medium">{entry.title}</div>
      {entry.message ? (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1.5 text-xs text-foreground/80">
          {entry.message}
        </pre>
      ) : null}
      {entry.images.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {entry.images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onPreview(img)}
              className="group relative size-16 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition hover:ring-foreground/30"
              aria-label={`预览 ${img.original_name}`}
            >
              <img
                src={absoluteUrl(img.url)}
                alt={img.original_name}
                loading="lazy"
                className="size-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {entry.username ? <span>用户 {entry.username}</span> : null}
        {entry.ip ? <span>IP {entry.ip}</span> : null}
        {entry.user_agent ? (
          <span className="truncate max-w-[20rem]" title={entry.user_agent}>
            UA {entry.user_agent}
          </span>
        ) : null}
        {canManage && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-rose-600 hover:underline"
            onClick={() => onDelete(entry)}
          >
            <Trash2 className="size-3" />
            删除
          </button>
        )}
      </div>
    </li>
  );
}

function EmptyState({ loading, hasFilter }: { loading: boolean; hasFilter: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center px-3 py-8 text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3.5 animate-spin" />
        加载中…
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
      <Info className="size-5 opacity-50" />
      {hasFilter ? "没有匹配当前筛选条件的日志" : "暂无日志，点击「新建日志」开始记录"}
    </div>
  );
}

function Pagination(props: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  onChange: (nextOffset: number) => void;
}) {
  const { page, total, limit, loading, onChange } = props;
  if (total === 0) return null;
  const prevDisabled = props.offset === 0;
  const nextDisabled = props.offset + limit >= total;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        第 {page} 页 · 每页 {limit} 条
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          disabled={prevDisabled || loading}
          onClick={() => onChange(Math.max(0, props.offset - limit))}
        >
          上一页
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={nextDisabled || loading}
          onClick={() => onChange(props.offset + limit)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function CreateLogDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: string[];
  onCreated: () => void;
}) {
  const { open, onOpenChange, sources, onCreated } = props;
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<Level>("info");
  const [source, setSource] = useState("manual");
  const [images, setImages] = useState<LogImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setMessage("");
      setLevel("info");
      setSource("manual");
      setImages([]);
      setUploading(false);
      setDragOver(false);
      setSubmitting(false);
    }
  }, [open]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const f of Array.from(files)) {
          try {
            const att = await uploadFile(f);
            setImages((prev) => [
              ...prev,
              {
                id: att.id,
                original_name: att.original_name,
                size: att.size,
                content_type: att.content_type,
                url: att.url,
                created_at: att.created_at,
              },
            ]);
          } catch (err) {
            toast.error(
              `${f.name}: ${err instanceof Error ? err.message : "上传失败"}`,
            );
          }
        }
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error("请填写标题");
      return;
    }
    setSubmitting(true);
    try {
      await createLog({
        title: title.trim(),
        message: message.trim() || undefined,
        level,
        source: source.trim() || "manual",
        image_ids: images.map((i) => i.id),
      });
      toast.success("日志已保存");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }, [title, message, level, source, images, onCreated, onOpenChange]);

  const removeImage = useCallback((id: number) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const sourceOptions = sources.length > 0 ? sources : ["manual"];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建日志"
      description="记录一段系统日志,可以附加截图作为现场证据。"
      size="lg"
      className="max-w-2xl"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" disabled={submitting || !title.trim()} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <ScrollText className="size-3.5" />}
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简短说明,如「数据库导出失败」"
              maxLength={255}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">级别</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">来源</label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              list="log-source-options"
              placeholder="manual"
            />
            <datalist id="log-source-options">
              {sourceOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">消息</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="详细描述,支持换行(可选)"
            rows={5}
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">现场截图(可选)</label>
          <label
            htmlFor="log-image-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex h-20 cursor-pointer flex-col items-center justify-center rounded-md border text-xs transition-colors",
              dragOver
                ? "border-primary bg-primary/5 text-foreground"
                : "border-dashed border-border bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {uploading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                上传中…
              </span>
            ) : (
              <>
                <UploadCloud className="mb-0.5 size-4" />
                拖拽图片到此处,或点击选择
              </>
            )}
            <input
              ref={inputRef}
              id="log-image-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </label>
          {images.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {images.map((img) => (
                <li
                  key={img.id}
                  className="group relative size-16 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10"
                >
                  <img
                    src={absoluteUrl(img.url)}
                    alt={img.original_name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    aria-label="移除图片"
                    className="absolute right-0 top-0 flex size-5 items-center justify-center rounded-bl-md bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            建议同时附上当时的截图便于事后排查;图片会先上传到「文件管理」,随后与日志一起保存。
          </p>
        </div>
      </div>
    </Dialog>
  );
}