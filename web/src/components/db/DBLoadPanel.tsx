import { useRef, useState } from "react";
import { Database, FolderOpen, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { loadDB, uploadDB } from "@/lib/api";

interface DBLoadPanelProps {
  onLoaded: () => void;
}

export function DBLoadPanel({ onLoaded }: DBLoadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      await uploadDB(file);
      onLoaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onLoadByPath = async () => {
    setError(null);
    if (!path.trim()) {
      setError("请输入服务端数据库文件路径");
      return;
    }
    setLoading(true);
    try {
      await loadDB(path.trim());
      onLoaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Database className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-lg">加载 SQLite 数据库</CardTitle>
          <CardDescription>
            上传 .db 文件或从服务端路径打开,即可管理其中的表与数据
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void onUpload(file);
            }}
          >
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-sm">
              拖拽 .db / .sqlite / .sqlite3 文件到此处
              <div className="text-xs text-muted-foreground">或</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".db,.sqlite,.sqlite3"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "上传中…" : "选择文件"}
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            <span>或</span>
            <Separator className="flex-1" />
          </div>

          <div className="flex gap-2">
            <FolderOpen className="mt-2 size-4 text-muted-foreground" />
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">
                服务端文件路径
              </label>
              <div className="flex gap-2">
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/var/data/example.db"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onLoadByPath();
                  }}
                />
                <Button
                  type="button"
                  disabled={loading}
                  onClick={() => void onLoadByPath()}
                >
                  {loading ? "加载中…" : "加载"}
                </Button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}