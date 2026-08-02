import { Card } from "@/components/ui/card";
import type { Note } from "@/features/notes/types";
import { formatDateTime } from "@/lib/api";

interface NoteCardProps {
  note: Note;
  onClick: (note: Note) => void;
}

export function NoteCard({ note, onClick }: NoteCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onClick(note)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(note);
        }
      }}
      className="cursor-pointer select-none rounded-2xl border-border/60 bg-card p-4 shadow-sm transition active:scale-[0.985] hover:shadow-md"
    >
      <h3 className="truncate text-base font-semibold">
        {note.title || "(无标题)"}
      </h3>
      {note.content ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground break-words">
          {note.content}
        </p>
      ) : null}
      <div className="mt-2 text-xs text-muted-foreground/80">
        {formatDateTime(note.updated_at)}
      </div>
    </Card>
  );
}
