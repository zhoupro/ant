import { useCallback, useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { NoteCard } from "@/components/NoteCard";
import { NoteEditor } from "@/components/NoteEditor";
import { TopBar } from "@/components/TopBar";
import {
  logout as apiLogout,
  changePassword,
  createNote,
  deleteNote as apiDeleteNote,
  listNotes,
  login,
  me,
  updateNote,
} from "@/lib/api";
import type { Note } from "@/features/notes/types";
import type { User } from "@/features/auth/types";

type View =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "change-password"; user: User }
  | { kind: "app"; user: User };

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });

  const checkAuth = useCallback(async () => {
    try {
      const user = await me();
      if (user.must_change_password) {
        setView({ kind: "change-password", user });
      } else {
        setView({ kind: "app", user });
      }
    } catch {
      setView({ kind: "login" });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (view.kind === "loading") {
    return <BootScreen />;
  }
  if (view.kind === "login") {
    return (
      <>
        <LoginForm
          onSubmit={async (input) => {
            const user = await login(input);
            if (user.must_change_password) {
              setView({ kind: "change-password", user });
            } else {
              setView({ kind: "app", user });
              toast.success(`欢迎回来，${user.username}`);
            }
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }
  if (view.kind === "change-password") {
    return (
      <>
        <ChangePasswordForm
          username={view.user.username}
          onSubmit={async (input) => {
            const user = await changePassword(input);
            setView({ kind: "app", user });
            toast.success("密码已更新");
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  return (
    <NotesApp
      user={view.user}
      onLogout={async () => {
        try {
          await apiLogout();
        } catch {
          toast.error("退出登录失败");
        } finally {
          setView({ kind: "login" });
        }
      }}
    />
  );
}

interface NotesAppProps {
  user: User;
  onLogout: () => Promise<void>;
}

function NotesApp({ user, onLogout }: NotesAppProps) {
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
      <TopBar user={user} onNew={openNew} onLogout={onLogout} />
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

function BootScreen() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background text-muted-foreground">
      <span className="text-sm">加载中…</span>
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
