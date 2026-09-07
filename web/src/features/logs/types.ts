export type LogLevel = "debug" | "info" | "warn" | "error";
export type UserKind = "admin" | "regular";

export interface LogImage {
  id: number;
  original_name: string;
  size: number;
  content_type: string;
  url: string;
  created_at: string;
}

export interface LogEntry {
  id: number;
  level: LogLevel;
  source: string;
  title: string;
  message: string;
  user_id?: number | null;
  user_kind?: UserKind | null;
  username?: string;
  method?: string;
  path?: string;
  status_code?: number | null;
  ip?: string;
  user_agent?: string;
  duration_ms?: number | null;
  metadata?: Record<string, unknown> | string | null;
  images: LogImage[];
  created_at: string;
}

export interface LogFacets {
  levels: string[];
  sources: string[];
}

export interface LogListResponse {
  items: LogEntry[];
  total: number;
  limit: number;
  offset: number;
  levels: string[];
  sources: string[];
}

export interface CreateLogInput {
  title: string;
  level?: LogLevel;
  source?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  image_ids?: number[];
}