package cronjobs

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"mc/models"
)

// 默认执行上限:30 分钟足够大多数运维/统计/同步类 shell 脚本,
// 同时防止一个被卡死的脚本拖垮调度器或占满日志目录。
const defaultExecutionTimeout = 30 * time.Minute

// 默认命令尾部字节上限:超出后会截断并追加提示,避免一条
// 异常输出把 stdout/stderr 撑到 GB 级别写爆数据库。
const defaultMaxOutputBytes = 1 << 20 // 1 MiB

// Runner 负责把一条 CronJob 真正运行起来:准备日志文件、fork 子进程、
// 收集 stdout/stderr、写回 CronJobRun。多个 goroutine 可以并发触发
// 同一个 Runner,每个 Run 都有独立的 context / cmd,互不干扰。
type Runner struct {
	workdir     string
	maxOutput   int64
	timeout     time.Duration
	shellBinary string

	mu      sync.Mutex
	running map[runKey]runHandle
}

type runHandle struct {
	cancel    context.CancelFunc
	pgidCh    chan int // execute 在 cmd.Start 后把进程组 ID 传出来
}

// NewRunner 在给定日志根目录下构造 Runner,目录不存在会自动创建。
// 留空日志根目录时退回到 ./data/cron-logs 相对路径。
func NewRunner(logRoot string) (*Runner, error) {
	if strings.TrimSpace(logRoot) == "" {
		logRoot = filepath.Join("data", "cron-logs")
	}
	abs, err := filepath.Abs(logRoot)
	if err != nil {
		return nil, fmt.Errorf("无法解析日志根目录: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("无法创建日志目录: %w", err)
	}
	shell, err := detectShell()
	if err != nil {
		return nil, err
	}
	return &Runner{
		workdir:     abs,
		maxOutput:   defaultMaxOutputBytes,
		timeout:     defaultExecutionTimeout,
		shellBinary: shell,
		running:     map[runKey]runHandle{},
	}, nil
}

// LogRoot 返回日志根目录的绝对路径,供前端展示或运维参考。
func (r *Runner) LogRoot() string { return r.workdir }

// SetTimeout 调整默认执行超时,0 表示不限制。
func (r *Runner) SetTimeout(d time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if d <= 0 {
		r.timeout = 0
		return
	}
	r.timeout = d
}

// Run 在新的 goroutine 中执行 job,并立刻返回 runID。
// store 用来落库、scheduler 用来通知 nextRun,二者皆可为空(纯跑命令)。
func (r *Runner) Run(job *models.CronJob, store *Store, trigger, actor string) (uint, error) {
	if job == nil {
		return 0, errors.New("job 为空")
	}
	if strings.TrimSpace(job.Command) == "" {
		return 0, errors.New("shell 命令为空")
	}
	if job.ID == 0 {
		return 0, errors.New("job 缺少 ID,无法记录运行历史")
	}
	if trigger == "" {
		trigger = models.CronTriggerManual
	}

	run := &models.CronJobRun{
		JobID:     job.ID,
		Status:    models.CronRunStatusRunning,
		Trigger:   trigger,
		StartedAt: time.Now(),
		CreatedBy: actor,
	}

	relLogPath := r.relativeLogPath(job, run.StartedAt)
	absLogPath := filepath.Join(r.workdir, filepath.FromSlash(relLogPath))
	if err := os.MkdirAll(filepath.Dir(absLogPath), 0o755); err != nil {
		return 0, fmt.Errorf("无法创建日志子目录: %w", err)
	}
	logFile, err := os.OpenFile(absLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return 0, fmt.Errorf("无法打开日志文件: %w", err)
	}
	run.LogPath = relLogPath

	if store != nil {
		if err := store.CreateRun(run); err != nil {
			logFile.Close()
			return 0, fmt.Errorf("保存运行记录失败: %w", err)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	pgidCh := make(chan int, 1)
	r.register(job.ID, run.ID, runHandle{cancel: cancel, pgidCh: pgidCh})
	go func() {
		defer r.unregister(job.ID, run.ID)
		r.execute(ctx, job, run, store, logFile, pgidCh, actor)
	}()

	return run.ID, nil
}

// Cancel 尝试取消仍在执行的某次运行,主要用于后台手动中止。
// 返回是否真的有运行中的进程被取消。
func (r *Runner) Cancel(jobID, runID uint) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := runKey{jobID: jobID, runID: runID}
	handle, ok := r.running[key]
	if !ok {
		return false
	}
	// 优先用进程组 KILL,把 shell 及其所有后台子进程一次性结束。
	// pgidCh 已被 execute 填充 —— 这里非阻塞读一次,没拿到也没关系。
	select {
	case pgid := <-handle.pgidCh:
		if pgid > 0 {
			_ = syscall.Kill(-pgid, syscall.SIGKILL)
		}
	default:
	}
	if handle.cancel != nil {
		handle.cancel()
	}
	return true
}

// KillProcessGroup 给定进程组 ID 发送 SIGKILL,确保连同所有子进程一起结束。
// 在 macOS / Linux 上都通过 syscall.Kill 实现。
func killProcessGroup(pgid int) error {
	if pgid <= 0 {
		return nil
	}
	return syscall.Kill(-pgid, syscall.SIGKILL)
}

// handleExecError 在 cmd.Start 阶段就失败时回填 run 记录。
func handleExecError(run *models.CronJobRun, stdoutBuf, stderrBuf *boundedBuffer, startErr error, store *Store, logFile *os.File) {
	finished := time.Now()
	duration := finished.Sub(run.StartedAt)
	run.FinishedAt = &finished
	run.DurationMs = duration.Milliseconds()
	code := -1
	run.ExitCode = &code
	run.Status = models.CronRunStatusFailed
	run.Error = startErr.Error()
	run.Stdout = stdoutBuf.String()
	run.Stderr = stderrBuf.String()
	fmt.Fprintf(logFile, "\n===== done status=failed exit=-1 duration=%s at=%s =====\n",
		duration.Round(time.Millisecond), finished.Format(time.RFC3339))
	if store != nil {
		_ = store.UpdateRun(run)
	}
}

// IsRunning 判断某次运行是否仍在前台进程表里。
func (r *Runner) IsRunning(jobID, runID uint) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.running[runKey{jobID: jobID, runID: runID}]
	return ok
}

// execute 是真正执行 shell 命令的内部函数:它准备子进程、把 stdout/stderr
// 同时复制到日志文件 + 内存 buffer(限定大小),最后把结果写回数据库。
func (r *Runner) execute(
	parent context.Context,
	job *models.CronJob,
	run *models.CronJobRun,
	store *Store,
	logFile *os.File,
	pgidCh chan int,
	actor string,
) {
	defer logFile.Close()

	timeout := r.timeout
	if timeout > 0 {
		var cancel context.CancelFunc
		parent, cancel = context.WithTimeout(parent, timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(parent, r.shellBinary, "-c", job.Command)
	// 给每个任务一个独立的工作目录,避免相互污染 cwd。
	cmd.Dir = r.workdir
	// Setpgid 把子进程放到新的进程组,cancel 时一起 kill,
	// 避免只杀掉 /bin/sh 后后台的 sleep / 管道命令残留。
	cmd.SysProcAttr = sysProcAttrForSetpgid()
	cmd.Env = append(os.Environ(),
		"MC_CRON_JOB_ID="+fmt.Sprint(job.ID),
		"MC_CRON_JOB_NAME="+job.Name,
		"MC_CRON_RUN_ID="+fmt.Sprint(run.ID),
		"MC_CRON_TRIGGER="+run.Trigger,
	)

	stdoutBuf := &boundedBuffer{limit: r.maxOutput}
	stderrBuf := &boundedBuffer{limit: r.maxOutput}

	cmd.Stdout = io.MultiWriter(logFile, stdoutBuf)
	cmd.Stderr = io.MultiWriter(logFile, stderrBuf)

	startBanner := fmt.Sprintf("\n===== run %d (job %d) %s =====\n", run.ID, job.ID, time.Now().Format(time.RFC3339))
	logFile.WriteString(startBanner)

	if err := cmd.Start(); err != nil {
		handleExecError(run, stdoutBuf, stderrBuf, err, store, logFile)
		return
	}
	// 把进程组 ID 通过 channel 报告给 register 句柄,
	// Cancel 时可直接 syscall.Kill(-pgid) 一次性杀掉整个进程组。
	if pgid := cmd.Process.Pid; pgid > 0 && pgidCh != nil {
		select {
		case pgidCh <- pgid:
		default:
		}
	}
	err := cmd.Wait()

	finished := time.Now()
	duration := finished.Sub(run.StartedAt)
	exitCode := 0
	status := models.CronRunStatusSuccess
	errMsg := ""
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
			status = models.CronRunStatusFailed
			errMsg = exitErr.Error()
		} else if errors.Is(err, context.DeadlineExceeded) {
			exitCode = -1
			status = models.CronRunStatusFailed
			errMsg = fmt.Sprintf("执行超时(超过 %s)", timeout)
		} else if errors.Is(err, context.Canceled) {
			status = models.CronRunStatusCanceled
			errMsg = "已被取消"
		} else {
			exitCode = -1
			status = models.CronRunStatusFailed
			errMsg = err.Error()
		}
	}

	endBanner := fmt.Sprintf("\n===== done status=%s exit=%d duration=%s at=%s =====\n",
		status, exitCode, duration.Round(time.Millisecond), finished.Format(time.RFC3339))
	logFile.WriteString(endBanner)

	run.FinishedAt = &finished
	run.DurationMs = duration.Milliseconds()
	run.ExitCode = &exitCode
	run.Status = status
	run.Stdout = stdoutBuf.String()
	run.Stderr = stderrBuf.String()
	if errMsg != "" {
		run.Error = errMsg
	}

	if store != nil {
		if err := store.UpdateRun(run); err != nil {
			log.Printf("cron: 更新 run 记录失败: %v", err)
		}
		if err := store.UpdateJobRunSummary(job.ID, run.StartedAt, status, finished); err != nil {
			log.Printf("cron: 更新 job 汇总失败: %v", err)
		}
	}

	if store != nil && actor != "" {
		_ = store.UpdateJobActor(job.ID, actor)
	}

	log.Printf("cron: job %d run %d finished status=%s exit=%d duration=%s", job.ID, run.ID, status, exitCode, duration)
}

// ReadLog 返回 run 指定日志文件的内容,offset 用于大日志分页。
// 文件不存在或 offset 越界会返回空串。
func (r *Runner) ReadLog(relPath string, offset int64, limit int) (string, int64, error) {
	clean := filepath.Clean("/" + strings.TrimLeft(relPath, "/\\"))
	if clean == "/" {
		return "", 0, errors.New("日志路径无效")
	}
	full := filepath.Join(r.workdir, filepath.FromSlash(clean))
	if !strings.HasPrefix(full, r.workdir+string(os.PathSeparator)) && full != r.workdir {
		return "", 0, errors.New("日志路径非法")
	}
	f, err := os.Open(full)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", 0, nil
		}
		return "", 0, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", 0, err
	}
	size := stat.Size()
	if offset < 0 {
		offset = 0
	}
	if offset >= size {
		return "", size, nil
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return "", size, err
	}
	cap := int64(limit)
	if cap <= 0 || cap > 1<<20 {
		cap = 1 << 20
	}
	buf := bytes.NewBuffer(nil)
	if _, err := io.CopyN(buf, f, cap); err != nil && !errors.Is(err, io.EOF) {
		return "", size, err
	}
	return buf.String(), size, nil
}

func (r *Runner) register(jobID, runID uint, handle runHandle) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.running[runKey{jobID: jobID, runID: runID}] = handle
}

func (r *Runner) unregister(jobID, runID uint) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.running, runKey{jobID: jobID, runID: runID})
}

// relativeLogPath 生成按 job / 时间分桶的日志相对路径,便于查找和清理。
func (r *Runner) relativeLogPath(job *models.CronJob, t time.Time) string {
	bucket := t.Format("2006/01/02")
	file := fmt.Sprintf("%d-%s-%d.log", job.ID, t.Format("20060102-150405"), job.ID)
	return filepath.ToSlash(filepath.Join(bucket, file))
}

func detectShell() (string, error) {
	candidates := []string{"/bin/sh", "/bin/bash", "sh"}
	for _, c := range candidates {
		if strings.HasPrefix(c, "/") {
			if _, err := os.Stat(c); err == nil {
				return c, nil
			}
			continue
		}
		if path, err := exec.LookPath(c); err == nil {
			return path, nil
		}
	}
	return "", errors.New("未找到可用的 shell(/bin/sh 或 /bin/bash)")
}

type runKey struct {
	jobID uint
	runID uint
}

// sysProcAttrForSetpgid 把 Setpgid=true + Pgid=0 一起返回 ——
// 等价于让 fork 出来的子进程自成一个新进程组,后续 cancel 时可以一次性
// 通过 syscall.Kill(-pgid) 杀掉整个进程组。Windows 上 Setpgid 被忽略。
func sysProcAttrForSetpgid() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

// boundedBuffer 限制最大字节数的 writer,超出后只记录截断提示。
type boundedBuffer struct {
	limit  int64
	buf    bytes.Buffer
	truncated bool
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	if b.truncated {
		return len(p), nil
	}
	remaining := b.limit - int64(b.buf.Len())
	if remaining <= 0 {
		b.truncated = true
		b.buf.WriteString("\n...[截断: 输出超过限制]\n")
		return len(p), nil
	}
	if int64(len(p)) <= remaining {
		b.buf.Write(p)
		return len(p), nil
	}
	b.buf.Write(p[:remaining])
	b.buf.WriteString("\n...[截断: 输出超过限制]\n")
	b.truncated = true
	return len(p), nil
}

func (b *boundedBuffer) String() string { return b.buf.String() }