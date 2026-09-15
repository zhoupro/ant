import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  onValid?: (parsed: unknown) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;

type TokenKind = "key" | "string" | "boolean" | "number" | "punct";

function tokenize(src: string): Array<{ kind: TokenKind; text: string }> {
  const out: Array<{ kind: TokenKind; text: string }> = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN_PATTERN)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      out.push({ kind: "string", text: src.slice(last, idx) });
    }
    if (m[1]) out.push({ kind: "key", text: m[1] });
    else if (m[2]) out.push({ kind: "string", text: m[2] });
    else if (m[3]) out.push({ kind: "boolean", text: m[3] });
    else if (m[4]) out.push({ kind: "number", text: m[4] });
    else if (m[5]) out.push({ kind: "punct", text: m[5] });
    last = idx + m[0].length;
  }
  if (last < src.length) {
    out.push({ kind: "string", text: src.slice(last) });
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function renderHighlighted(src: string): string {
  const tokens = tokenize(src);
  let html = "";
  for (const t of tokens) {
    const safe = escapeHtml(t.text);
    if (t.kind === "key") {
      html += `<span class="text-sky-600 dark:text-sky-400">${safe}</span>`;
    } else if (t.kind === "string") {
      html += `<span class="text-emerald-600 dark:text-emerald-400">${safe}</span>`;
    } else if (t.kind === "number") {
      html += `<span class="text-amber-600 dark:text-amber-400">${safe}</span>`;
    } else if (t.kind === "boolean") {
      html += `<span class="text-fuchsia-600 dark:text-fuchsia-400">${safe}</span>`;
    } else if (t.kind === "punct") {
      html += `<span class="text-muted-foreground">${safe}</span>`;
    }
  }
  return html;
}

function tryPretty(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

export function JsonEditor({
  value,
  onChange,
  onValid,
  rows = 8,
  placeholder,
  className,
  disabled,
}: JsonEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastEmittedRef = useRef<string>(value);

  const highlighted = useMemo(() => renderHighlighted(value), [value]);

  useEffect(() => {
    if (!value.trim()) {
      setError(null);
      onValid?.(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      setError(null);
      onValid?.(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON 格式错误");
    }
  }, [value, onValid]);

  const handleChange = (v: string) => {
    lastEmittedRef.current = v;
    onChange(v);
  };

  const format = () => {
    const pretty = tryPretty(value);
    if (pretty !== null && pretty !== value) {
      handleChange(pretty);
    }
  };

  const handleScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const lineCount = Math.max(rows, value.split("\n").length + 1);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative overflow-hidden rounded-lg border bg-transparent font-mono text-xs">
        <pre
          ref={preRef}
          aria-hidden
          className="pointer-events-none m-0 overflow-auto whitespace-pre-wrap break-words px-2.5 py-1.5 text-transparent caret-transparent"
          style={{ minHeight: "8rem", maxHeight: "24rem" }}
        >
          <code
            className="block"
            dangerouslySetInnerHTML={{
              __html: highlighted + "\n",
            }}
          />
        </pre>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onScroll={handleScroll}
          rows={lineCount}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          disabled={disabled}
          placeholder={placeholder}
          className="absolute inset-0 m-0 h-full w-full resize-none overflow-auto border-0 bg-transparent px-2.5 py-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ minHeight: "8rem", maxHeight: "24rem" }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-h-3 text-[11px] leading-3">
          {error ? (
            <span className="text-destructive">JSON 错误: {error}</span>
          ) : value.trim() ? (
            <span className="text-muted-foreground">JSON 格式正确</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={format}
            disabled={disabled || !!error || !value.trim()}
            className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
          >
            格式化
          </button>
          <button
            type="button"
            onClick={() => handleChange("")}
            disabled={disabled || !value}
            className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
          >
            清空
          </button>
        </div>
      </div>
    </div>
  );
}
