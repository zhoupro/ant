import { useCallback, useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { NoteCard } from "@/components/NoteCard";
import { NoteEditor } from "@/components/NoteEditor";
import { TopBar } from "@/components/TopBar";
import {
  createNote,
  deleteNote as apiDeleteNote,
  listNotes,
  updateNote,
} from "@/lib/api";
import type { Note } from "@/features/notes/types";

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listNotes();
      setNotes(data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败";
      toast.error(message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = useCallback(() => {
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((note: Note) => {
    setEditing(note);
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback(
    async (input: { title: string; content: string }) => {
      if (!input.title && !input.content) {
        toast.error("写点内容吧");
        return;
      }
      try {
        if (editing) {
          await updateNote(editing.id, input);
          toast.success("已更新");
        } else {
          await createNote(input);
          toast.success("已新建");
        }
        setEditorOpen(false);
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : "保存失败";
        toast.error(message);
      }
    },
    [editing, load]
  );

  const handleDelete = useCallback(
    async (note: Note) => {
      try {
        await apiDeleteNote(note.id);
        toast.success("已删除");
        setEditorOpen(false);
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : "删除失败";
        toast.error(message);
      }
    },
    [load]
  );

  return (
    <div className="min-h-svh bg-background text-foreground">
      <TopBar onNew={openNew} />
      <main className="mx-auto w-full max-w-2xl px-3 py-3 pb-12 sm:px-4 sm:py-5">
        {loaded && notes.length === 0 ? (
          <EmptyState onNew={openNew} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {notes.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} onClick={openEdit} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <NoteEditor
        open={editorOpen}
        note={editing}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center text-muted-foreground">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <StickyNote className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground/80">还没有便签</p>
        <p className="text-xs">点右上角＋新建</p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        现在写一条
      </button>
    </div>
  );
}
