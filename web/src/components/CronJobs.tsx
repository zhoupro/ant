import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Clipboard,
  Copy,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  TerminalSquare,
  Trash2,
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
import {
  cancelCronRun,
  createCronJob,
  deleteCronJob,
  formatDateTime,
  getCronRun,
  hasPermission,
  listCronJobs,
  listCronRuns,
  readCronRunLog,
  runCronJob,
  toggleCronJob,
  updateCronJob,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  AuthUser,
  CronJob,
  CronJobInput,
  CronJobRun,
} from "@/features/auth/types";

const CRON_PRESETS: { label: string; expr: string; description: string }[] = [
  { label: "每分钟", expr: "* * * * *", description: "分钟级测试 / 心跳" },
  { label: "每 5 分钟", expr: "*/5 * * * *", description: "高频巡检" },
  { label: "每小时", expr: "0 * * * *", description: "整点任务" },
  { label: "每天 0 点", expr: "0 0 * * *", description: "夜间批量" },
  { label: "每周一 0 点", expr: "0 0 * * 1", description: "周报生成" },
];

interface CronJobsProps {
  user: AuthUser;
}

export function CronJobs({ user }: CronJobsProps) {
  const canManage = hasPermission(user, "manage_cron_jobs");
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<{ mode: "create" | "edit"; job?: CronJob } | null>(null);
  const [historyJobId, setHistoryJobId] = useState<number | null>(null);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCronJobs();
      setJobs(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载任务失败");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(() => setEditing({ mode: "create" }), []);
  const handleEdit = useCallback((job: CronJob) => {
    setEditing({ mode: "edit", job });
  }, []);

  const handleSaved = useCallback(
    async (input: CronJobInput) => {
      try {
        if (editing?.mode === "edit" && editing.job) {
          await updateCronJob(editing.job.id, input);
          toast.success("任务已更新");
        } else {
          await createCronJob(input);
          toast.success("任务已创建");
        }
        setEditing(null);
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存失败");
      }
    },
    [editing, refresh],
  );

  const handleDelete = useCallback(
    async (job: CronJob) => {
      if (!window.confirm(`确定删除任务「${job.name}」？运行历史也会一并清理。`)) return;
      try {
        await deleteCronJob(job.id);
        toast.success("已删除");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "删除失败");
      }
    },
    [refresh],
  );

  const handleToggle = useCallback(
    async (job: CronJob) => {
      setBusyJobId(job.id);
      try {
        await toggleCronJob(job.id, !job.enabled);
        toast.success(job.enabled ? "已停用" : "已启用");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失败");
      } finally {
        setBusyJobId(null);
      }
    },
    [refresh],
  );

  const handleRun = useCallback(
    async (job: CronJob) => {
      setBusyJobId(job.id);
      try {
        const { run_id } = await runCronJob(job.id);
        toast.success(`已触发,运行 #${run_id}`);
        await refresh();
        setHistoryJobId(job.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "触发失败");
      } finally {
        setBusyJobId(null);
      }
    },
    [refresh],
  );

  const handleHistory = useCallback((job: CronJob) => {
    setHistoryJobId(job.id);
  }, []);

  return (
    <Card className="w-full max-w-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-foreground/70" />
          定时任务
        </CardTitle>
        <CardDescription>
          通过 cron 表达式调度 shell 脚本,可手动触发、查看运行历史与日志。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {loaded ? `共 ${jobs.length} 个任务` : "加载中…"}
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={handleCreate} disabled={loading}>
              <Plus className="size-3.5" />
              新建任务
            </Button>
          ) : null}
        </div>

        <ul className="divide-y divide-border ring-1 ring-foreground/5">
          {!loaded ? (
            <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </li>
          ) : jobs.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              尚未创建任何定时任务
            </li>
          ) : (
            jobs.map((job) => (
              <CronJobRow
                key={job.id}
                job={job}
                canManage={canManage}
                busy={busyJobId === job.id}
                onEdit={() => handleEdit(job)}
                onDelete={() => handleDelete(job)}
                onToggle={() => handleToggle(job)}
                onRun={() => handleRun(job)}
                onHistory={() => handleHistory(job)}
              />
            ))
          )}
        </ul>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <TerminalSquare className="mt-0.5 size-3.5 shrink-0" />
          <span>
            shell 命令会以 /bin/sh -c 执行,工作目录为 <code className="font-mono">data/cron-logs</code>,
            标准输出与错误输出同时写入日志文件与数据库。任务默认 30 分钟超时,可使用
            <code className="mx-1 font-mono">exit</code> 或信号自行结束。
          </span>
        </div>
      </CardContent>

      <CronJobEditor
        open={!!editing}
        initial={editing?.mode === "edit" ? editing.job : undefined}
        onClose={() => setEditing(null)}
        onSubmit={handleSaved}
      />

      <CronRunHistory
        open={historyJobId !== null}
        jobId={historyJobId}
        jobs={jobs}
        canManage={canManage}
        onClose={() => setHistoryJobId(null)}
        onAfterTrigger={refresh}
      />
    </Card>
  );
}

interface CronJobRowProps {
  job: CronJob;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
  onHistory: () => void;
}

function CronJobRow({
  job,
  canManage,
  busy,
  onEdit,
  onDelete,
  onToggle,
  onRun,
  onHistory,
}: CronJobRowProps) {
  const lastStatus = (job.last_status ?? "").toLowerCase();
  const lastAt = job.last_run_at ? formatDateTime(job.last_run_at) : "—";
  const nextAt = job.next_run_at ? formatDateTime(job.next_run_at) : "—";
  return (
    <li className="space-y-2 px-3 py-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground/90">{job.name}</span>
        <code className="font-mono text-[11px] text-muted-foreground">{job.cron_expr}</code>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px]",
            job.enabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {job.enabled ? "已启用" : "已停用"}
        </span>
        {lastStatus ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px]",
              lastStatus === "success"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : lastStatus === "running"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : lastStatus === "canceled"
                    ? "bg-muted text-muted-foreground"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
            )}
          >
            上次 {statusLabel(lastStatus)}
          </span>
        ) : null}
      </div>
      {job.description ? (
        <div className="text-[11px] text-muted-foreground">{job.description}</div>
      ) : null}
      <pre className="overflow-x-auto rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">
        {job.command}
      </pre>
      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground sm:grid-cols-3">
        <span>上次执行 {lastAt}</span>
        <span>下次执行 {job.enabled ? nextAt : "—"}</span>
        <span>
          创建 {job.created_by ?? "—"} · 更新 {job.updated_by ?? "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onHistory}
        >
          <History className="size-3.5" />
          运行历史
        </Button>
        {canManage ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onRun}
              disabled={busy}
              title="立即触发一次"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              触发
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onToggle}
              disabled={busy}
            >
              {job.enabled ? (
                <>
                  <Pause className="size-3.5" />
                  停用
                </>
              ) : (
                <>
                  <Power className="size-3.5" />
                  启用
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onEdit}
              disabled={busy}
            >
              <Pencil className="size-3.5" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

interface CronJobEditorProps {
  open: boolean;
  initial?: CronJob;
  onClose: () => void;
  onSubmit: (input: CronJobInput) => Promise<void> | void;
}

function CronJobEditor({ open, initial, onClose, onSubmit }: CronJobEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpr, setCronExpr] = useState("");
  const [command, setCommand] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setCronExpr(initial?.cron_expr ?? "");
    setCommand(initial?.command ?? "");
    setEnabled(initial?.enabled ?? true);
  }, [open, initial]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    if (!cronExpr.trim()) {
      toast.error("cron 表达式不能为空");
      return;
    }
    if (!command.trim()) {
      toast.error("shell 命令不能为空");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        cron_expr: cronExpr.trim(),
        command,
        enabled,
      });
    } finally {
      setSaving(false);
    }
  }, [name, description, cronExpr, command, enabled, onSubmit]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={initial ? "编辑定时任务" : "新建定时任务"}
      description="任务将以 /bin/sh -c 执行。cron 表达式遵循标准 5 段格式。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="cron-name" className="text-xs text-muted-foreground">
            名称 <span className="text-destructive">*</span>
          </label>
          <Input
            id="cron-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
            placeholder="例如：每日归档"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="cron-desc" className="text-xs text-muted-foreground">
            描述
          </label>
          <Input
            id="cron-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={512}
            placeholder="可选"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="cron-expr" className="text-xs text-muted-foreground">
            cron 表达式 <span className="text-destructive">*</span>
          </label>
          <Input
            id="cron-expr"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="分 时 日 月 周,例如 0 * * * *"
            className="h-8 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.expr}
                type="button"
                className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                onClick={() => setCronExpr(p.expr)}
                title={p.description}
              >
                {p.label} · {p.expr}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="cron-cmd" className="text-xs text-muted-foreground">
            shell 命令 <span className="text-destructive">*</span>
          </label>
          <textarea
            id="cron-cmd"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={6}
            placeholder={`# 例如：备份数据库并打印结果\necho "starting backup at $(date)"\nmysqldump -h db mydb | gzip > /tmp/backup.sql.gz\necho "done"`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px] leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <input
            id="cron-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-3.5 rounded border-input text-primary focus:ring-ring"
          />
          <label htmlFor="cron-enabled" className="text-xs text-muted-foreground">
            创建后立即启用
          </label>
        </div>
      </div>
    </Dialog>
  );
}

interface CronRunHistoryProps {
  open: boolean;
  jobId: number | null;
  jobs: CronJob[];
  canManage: boolean;
  onClose: () => void;
  onAfterTrigger?: () => Promise<void> | void;
}

function CronRunHistory({
  open,
  jobId,
  jobs,
  canManage,
  onClose,
  onAfterTrigger,
}: CronRunHistoryProps) {
  const [runs, setRuns] = useState<CronJobRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [page] = useState(0);
  const PAGE_SIZE = 20;

  const job = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await listCronRuns(jobId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRuns(res.runs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载历史失败");
    } finally {
      setLoading(false);
    }
  }, [jobId, page]);

  useEffect(() => {
    if (open && jobId) {
      void refresh();
      setRunId(null);
    }
  }, [open, jobId, refresh]);

  // 轮询当前选中的 run,用于显示运行中状态。
  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !jobId || !runId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await getCronRun(jobId, runId);
        if (cancelled) return;
        setRuns((prev) => prev.map((x) => (x.id === r.id ? r : x)));
        if (r.status === "running") {
          pollingRef.current = window.setTimeout(tick, 1500);
        }
      } catch {
        pollingRef.current = window.setTimeout(tick, 4000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (pollingRef.current) {
        window.clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [open, jobId, runId]);

  const handleRun = useCallback(async () => {
    if (!job) return;
    try {
      const { run_id } = await runCronJob(job.id);
      toast.success(`已触发,运行 #${run_id}`);
      await refresh();
      setRunId(run_id);
      if (onAfterTrigger) await onAfterTrigger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "触发失败");
    }
  }, [job, refresh, onAfterTrigger]);

  const handleCancel = useCallback(
    async (run: cronJobRun) => {
      if (!job) return;
      try {
        await cancelCronRun(job.id, run.id);
        toast.success("已发送取消信号");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "取消失败");
      }
    },
    [job, refresh],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={job ? `运行历史 · ${job.name}` : "运行历史"}
      description={
        job
          ? `cron: ${job.cron_expr} · ${job.enabled ? "已启用" : "已停用"}`
          : ""
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          {canManage && job ? (
            <Button size="sm" onClick={() => void handleRun()}>
              <Play className="size-3.5" />
              立即触发
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </div>
          ) : runs.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              暂无运行记录
            </div>
          ) : (
            <ul className="space-y-1">
              {runs.map((r) => {
                const isActive = runId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setRunId(r.id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">#{r.id}</span>
                        <RunStatusBadge status={r.status} />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDateTime(r.started_at)} · {r.trigger === "schedule" ? "调度" : "手动"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {(r.duration_ms / 1000).toFixed(1)}s{r.exit_code !== null && r.exit_code !== undefined ? ` · exit ${r.exit_code}` : ""}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="min-h-[60vh]">
          <RunDetail jobId={jobId} runId={runId} canManage={canManage} onCancel={handleCancel} />
        </div>
      </div>
    </Dialog>
  );
}

interface RunDetailProps {
  jobId: number | null;
  runId: number | null;
  canManage: boolean;
  onCancel: (run: cronJobRun) => void;
}

type cronJobRun = CronJobRun;

function RunDetail({ jobId, runId, canManage, onCancel }: RunDetailProps) {
  const [run, setRun] = useState<cronJobRun | null>(null);
  const [log, setLog] = useState("");
  const [logSize, setLogSize] = useState(0);
  const [logOffset, setLogOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchRun = useCallback(async () => {
    if (!jobId || !runId) {
      setRun(null);
      return;
    }
    setLoading(true);
    try {
      const r = await getCronRun(jobId, runId);
      setRun(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载运行详情失败");
    } finally {
      setLoading(false);
    }
  }, [jobId, runId]);

  useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  // 拉日志:首次打开从 0 开始,后续点「加载更多」递增 offset。
  const fetchLog = useCallback(
    async (offset: number, append: boolean) => {
      if (!jobId || !runId) return;
      try {
        const slice = await readCronRunLog(jobId, runId, { offset, limit: 64 << 10 });
        setLog((prev) => (append ? prev + slice.content : slice.content));
        setLogOffset(slice.next);
        setLogSize(slice.size);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "读取日志失败");
      }
    },
    [jobId, runId],
  );

  useEffect(() => {
    setLog("");
    setLogOffset(0);
    setLogSize(0);
    if (jobId && runId) {
      void fetchLog(0, false);
    }
  }, [jobId, runId, fetchLog]);

  if (!runId) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
        从左侧选择一条运行记录查看详情与日志
      </div>
    );
  }
  if (loading && !run) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3.5 animate-spin" />
        加载中…
      </div>
    );
  }
  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        运行记录不存在
      </div>
    );
  }

  const headerSubtitle = `开始 ${formatDateTime(run.started_at)} · 耗时 ${(run.duration_ms / 1000).toFixed(1)}s${
    run.exit_code !== null && run.exit_code !== undefined ? ` · exit ${run.exit_code}` : ""
  }`;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="text-muted-foreground">{headerSubtitle}</span>
        </div>
        {run.error ? (
          <div className="mt-1 rounded bg-rose-100 px-2 py-1 font-mono text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {run.error}
          </div>
        ) : null}
        {canManage && (run.status === "running" || run.is_running) ? (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onCancel(run)}
            >
              <Power className="size-3.5" />
              取消执行
            </Button>
          </div>
        ) : null}
      </div>

      {run.stdout_preview ? (
        <Section
          title="stdout (尾部)"
          copyText={run.stdout_preview}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard
              .writeText(run.stdout_preview)
              .then(() => {
                setCopied(true);
                toast.success("已复制到剪贴板");
                window.setTimeout(() => setCopied(false), 1200);
              })
              .catch(() => toast.error("复制失败"));
          }}
          body={
            <pre className="overflow-x-auto rounded-md bg-zinc-950/95 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-100">
              {run.stdout_preview}
            </pre>
          }
          footer={
            run.stdout_truncated
              ? `已截断,完整输出共 ${run.stdout_size} 字节,可在下方日志中加载更多。`
              : `共 ${run.stdout_size} 字节`
          }
        />
      ) : null}

      {run.stderr_preview ? (
        <Section
          title="stderr (尾部)"
          copyText={run.stderr_preview}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard
              .writeText(run.stderr_preview)
              .then(() => {
                setCopied(true);
                toast.success("已复制到剪贴板");
                window.setTimeout(() => setCopied(false), 1200);
              })
              .catch(() => toast.error("复制失败"));
          }}
          body={
            <pre className="overflow-x-auto rounded-md bg-rose-950/90 px-3 py-2 font-mono text-[11px] leading-relaxed text-rose-50">
              {run.stderr_preview}
            </pre>
          }
          footer={
            run.stderr_truncated
              ? `已截断,完整输出共 ${run.stderr_size} 字节`
              : `共 ${run.stderr_size} 字节`
          }
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border bg-muted/20 p-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <TerminalSquare className="size-3.5" />
            <span>日志文件</span>
            <span className="font-mono">{run.log_path || "—"}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {logOffset}/{logSize || "?"} 字节
          </span>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-zinc-950/95 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-100">
          {log || "(暂无内容)"}
        </pre>
        {logSize > 0 && logOffset < logSize ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void fetchLog(logOffset, true)}
            >
              加载更多 ({logSize - logOffset} 字节)
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  body: React.ReactNode;
  footer?: React.ReactNode;
  copyText: string;
  copied: boolean;
  onCopy: () => void;
}

function Section({ title, body, footer, copyText, copied, onCopy }: SectionProps) {
  if (!copyText) return null;
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{title}</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted"
          onClick={onCopy}
        >
          {copied ? <Clipboard className="size-3" /> : <Copy className="size-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      {body}
      {footer ? (
        <div className="pt-1 text-[10px] text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}

function RunStatusBadge({ status }: { status: cronJobRun["status"] }) {
  const label = statusLabel(status);
  const cls =
    status === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : status === "running"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : status === "canceled"
          ? "bg-muted text-muted-foreground"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px]", cls)}>
      {status === "running" ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
      {label}
    </span>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
    default:
      return status;
  }
}