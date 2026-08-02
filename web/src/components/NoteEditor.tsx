import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/notes/types";

interface NoteEditorProps {
  open: boolean;
  note: Note | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { title: string; content: string }) => Promise<void> | void;
  onDelete: (note: Note) => Promise<void> | void;
}

const noSuggestProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

export function NoteEditor({
  open,
  note,
  onOpenChange,
  onSave,
  onDelete,
}: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(note?.title ?? "");
      setContent(note?.content ?? "");
      setSaving(false);
      setConfirmDelete(false);
    }
  }, [open, note]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!note) return;
    await onDelete(note);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className={cn(
            "gap-0 rounded-t-2xl border-t bg-popover p-0",
            "max-h-[85vh] flex flex-col"
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                返回
              </Button>
              <SheetTitle className="text-base">
                {note ? "编辑便签" : "新建便签"}
              </SheetTitle>
            </div>
            {note ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive"
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
            ) : null}
          </SheetHeader>
          <SheetDescription className="sr-only">
            编辑或新建便签内容
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <Input
              placeholder="标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoFocus={open}
              {...noSuggestProps}
            />
            <Textarea
              placeholder="写点什么..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={10}
              className="min-h-40 resize-y"
              {...noSuggestProps}
            />
          </div>

          <Separator />
          <SheetFooter className="mt-0 flex-row gap-2 border-t-0 bg-popover px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条便签？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
