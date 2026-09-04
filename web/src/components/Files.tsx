import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
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
  absoluteUrl,
  deleteUpload,
  formatBytes,
  formatDateTime,
  listUploads,
  uploadFile,
  type Attachment,
} from "@/lib/api";

const dragHoverClass =
  "border-primary bg-primary/5 text-foreground";
const dragIdleClass =
  "border-dashed border-border bg-muted/40 text-muted-foreground hover:bg-muted/60";

export function Files() {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listUploads();
      setItems(list);
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

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      const queue = Array.from(files);
      let okCount = 0;
      let fail = 0;
      for (const f of queue) {
        try {
          await uploadFile(f);
          okCount++;
        } catch (err) {
          fail++;
          toast.error(
            `${f.name}: ${err instanceof Error ? err.message : "上传失败"}`,
          );
        }
      }
      if (okCount > 0) {
        toast.success(`已上传 ${okCount} 个文件`);
        await refresh();
      }
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    },
    [refresh],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragOver(false);
      void handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const onCopy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(absoluteUrl(url));
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }, []);

  const onDelete = useCallback(
    async (item: Attachment) => {
      if (!confirm(`确定删除 ${item.original_name}?`)) return;
      try {
        await deleteUpload(item.id);
        toast.success("已删除");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "删除失败");
      }
    },
    [refresh],
  );

  return (
    <Card className="w-full max-w-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4 text-foreground/70" />
          附件管理
        </CardTitle>
        <CardDescription>
          上传文件后即可复制链接，链接形如 /uploads/123
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          htmlFor="file-input"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
            dragOver ? dragHoverClass : dragIdleClass
          }`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              上传中…
            </span>
          ) : (
            <>
              <UploadCloud className="mb-1 size-5" />
              <span>拖拽文件到此处，或点击选择文件</span>
              <span className="mt-0.5 text-[11px] opacity-70">单个文件最大 100MB</span>
            </>
          )}
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>

        <Separator />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>已上传 {items?.length ?? 0} 个文件</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "刷新"
            )}
          </Button>
        </div>

        <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
          {loading && items === null ? (
            <li className="flex items-center justify-center px-3 py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </li>
          ) : items && items.length > 0 ? (
            items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {item.original_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatBytes(item.size)} · {formatDateTime(item.created_at)} ·{" "}
                    <a
                      href={absoluteUrl(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {item.url}
                    </a>
                  </div>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="复制链接"
                  onClick={() => void onCopy(item.url)}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="删除"
                  onClick={() => void onDelete(item)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))
          ) : (
            <li className="px-3 py-8 text-center text-xs text-muted-foreground">
              暂无文件
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
