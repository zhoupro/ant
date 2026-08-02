export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type NoteInput = Pick<Note, "title" | "content">;
