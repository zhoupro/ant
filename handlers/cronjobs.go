package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"mc/cronjobs"
	"mc/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	cronJobNameMaxLen    = 128
	cronJobDescMaxLen    = 512
	cronJobExprMaxLen    = 128
	cronJobCommandMaxLen = 64 * 1024 // 64KiB,足够复杂 shell 脚本
	cronRunLogMaxBytes   = 1 << 20    // 1 MiB,日志按需分片返回
)

// cronJobsKey —— 与其它 handlers 模块一样把依赖挂在 ctx。
const (
	cronJobsKey = "cronJobsDeps"
)

// cronJobsDeps 把 store + runner + scheduler 合并成一个对象,handler 内通过 ctx 取。
type cronJobsDeps struct {
	Store  *cronjobs.Store
	Runner *cronjobs.Runner
	Sched  *cronjobs.Scheduler
}

// RegisterCronJobsRoutes 把 /api/cronjobs/* 注册到 router 上,并把 deps 注入 ctx。
// 这样 cronJobs*() 函数能直接 c.Get 拿到依赖,不必每个 handler 重新解析。
func RegisterCronJobsRoutes(api *gin.RouterGroup, deps *cronJobsDeps) {
	view := requirePermission(models.PermViewCronJobs)
	manage := requirePermission(models.PermManageCronJobs)
	withDeps := WithCronJobsDeps

	api.GET("/cronjobs", authRequired, view, withDeps(cronJobsListHandler, deps))
	api.POST("/cronjobs", authRequired, manage, withDeps(cronJobsCreateHandler, deps))
	api.GET("/cronjobs/:id", authRequired, view, withDeps(cronJobsGetHandler, deps))
	api.PUT("/cronjobs/:id", authRequired, manage, withDeps(cronJobsUpdateHandler, deps))
	api.DELETE("/cronjobs/:id", authRequired, manage, withDeps(cronJobsDeleteHandler, deps))
	api.POST("/cronjobs/:id/toggle", authRequired, manage, withDeps(cronJobsToggleHandler, deps))
	api.POST("/cronjobs/:id/run", authRequired, manage, withDeps(cronJobsRunHandler, deps))
	api.POST("/cronjobs/:id/runs/:runId/cancel", authRequired, manage, withDeps(cronJobsCancelRunHandler, deps))

	api.GET("/cronjobs/:id/runs", authRequired, view, withDeps(cronJobsListRunsHandler, deps))
	api.GET("/cronjobs/:id/runs/:runId", authRequired, view, withDeps(cronJobsGetRunHandler, deps))
	api.GET("/cronjobs/:id/runs/:runId/log", authRequired, view, withDeps(cronJobsReadLogHandler, deps))
}

// WithCronJobsDeps 把 cron 依赖装入 gin ctx,然后调用真正的 handler。
// 跟 WithUploadDeps 一样属于"装入 + 直调"的写法,不依赖 c.Next()。
func WithCronJobsDeps(parent gin.HandlerFunc, deps *cronJobsDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(cronJobsKey, deps)
		parent(c)
	}
}

// --- 以下是实际 handler ---------------------------------------------------------

type cronJobInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CronExpr    string `json:"cron_expr"`
	Command     string `json:"command"`
	Enabled     *bool  `json:"enabled"`
}

func cronJobsListHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	if deps == nil || deps.Store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "定时任务存储未初始化"})
		return
	}
	rows, err := deps.Store.ListJobs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, cronJobPayload(deps, &rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func cronJobsGetHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	job, err := deps.Store.GetJob(parseUint(c.Param("id")))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cronJobPayload(deps, job)})
}

func cronJobsCreateHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var in cronJobInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateCronJobInput(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	enabled := true
	if in.Enabled != nil {
		enabled = *in.Enabled
	}
	job := &models.CronJob{
		Name:        strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description),
		CronExpr:    strings.TrimSpace(in.CronExpr),
		Command:     in.Command,
		Enabled:     enabled,
		CreatedBy:   p.user.Username,
		UpdatedBy:   p.user.Username,
	}
	if err := deps.Store.CreateJob(job); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if job.Enabled {
		if err := deps.Sched.Add(job); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "已保存,但加入调度器失败: " + err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": cronJobPayload(deps, job)})
}

func cronJobsUpdateHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id := parseUint(c.Param("id"))
	if _, err := deps.Store.GetJob(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var in cronJobInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateCronJobInput(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	fields := map[string]any{
		"name":        strings.TrimSpace(in.Name),
		"description": strings.TrimSpace(in.Description),
		"cron_expr":   strings.TrimSpace(in.CronExpr),
		"command":     in.Command,
		"updated_by":  p.user.Username,
	}
	if in.Enabled != nil {
		fields["enabled"] = *in.Enabled
	}
	updated, err := deps.Store.UpdateJob(id, fields)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := deps.Sched.Update(updated); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已保存,但更新调度器失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cronJobPayload(deps, updated)})
}

func cronJobsDeleteHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	id := parseUint(c.Param("id"))
	if _, err := deps.Store.GetJob(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	deps.Sched.Remove(id)
	if err := deps.Store.DeleteJob(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": id}})
}

type toggleInput struct {
	Enabled *bool `json:"enabled"`
}

func cronJobsToggleHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id := parseUint(c.Param("id"))
	job, err := deps.Store.GetJob(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in toggleInput
	if err := c.ShouldBindJSON(&in); err != nil || in.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 enabled 字段"})
		return
	}
	job.Enabled = *in.Enabled
	job.UpdatedBy = p.user.Username
	if _, err := deps.Store.UpdateJob(id, map[string]any{
		"enabled":    job.Enabled,
		"updated_by": job.UpdatedBy,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := deps.Sched.Update(job); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已保存,但调度器更新失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cronJobPayload(deps, job)})
}

func cronJobsRunHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id := parseUint(c.Param("id"))
	job, err := deps.Store.GetJob(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	runID, err := deps.Sched.TriggerNow(job, p.user.Username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"run_id": runID}})
}

func cronJobsCancelRunHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	jobID := parseUint(c.Param("id"))
	runID := parseUint(c.Param("runId"))
	if !deps.Runner.Cancel(jobID, runID) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "already_finished": true}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func cronJobsListRunsHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	jobID := parseUint(c.Param("id"))
	limit := parseInt(c.Query("limit"))
	offset := parseInt(c.Query("offset"))
	rows, total, err := deps.Store.ListRuns(jobID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, cronRunPayload(deps, &rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"runs":   out,
		"total":  total,
		"limit":  effectiveLimit(limit),
		"offset": maxInt(offset, 0),
	}})
}

func cronJobsGetRunHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	run, err := deps.Store.GetRun(parseUint(c.Param("runId")))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "运行记录不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cronRunPayload(deps, run)})
}

func cronJobsReadLogHandler(c *gin.Context) {
	deps := cronJobsDepsFrom(c)
	run, err := deps.Store.GetRun(parseUint(c.Param("runId")))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "运行记录不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if run.JobID != parseUint(c.Param("id")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "运行记录与任务不匹配"})
		return
	}
	offset := parseInt64(c.Query("offset"))
	limit := parseInt(c.Query("limit"))
	if limit <= 0 || limit > cronRunLogMaxBytes {
		limit = 64 << 10 // 64 KiB default
	}
	content, total, err := deps.Runner.ReadLog(run.LogPath, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"content":   content,
		"offset":    offset,
		"next":      offset + int64(len(content)),
		"size":      total,
		"truncated": run.Stdout != "" || run.Stderr != "",
		"has_more":  offset+int64(len(content)) < total,
	}})
}

// --- 辅助函数 -------------------------------------------------------------------

func cronJobsDepsFrom(c *gin.Context) *cronJobsDeps {
	deps, _ := c.Get(cronJobsKey)
	if d, ok := deps.(*cronJobsDeps); ok {
		return d
	}
	return nil
}

func cronJobPayload(deps *cronJobsDeps, job *models.CronJob) gin.H {
	out := gin.H{
		"id":          job.ID,
		"name":        job.Name,
		"description": job.Description,
		"cron_expr":   job.CronExpr,
		"command":     job.Command,
		"enabled":     job.Enabled,
		"created_by":  job.CreatedBy,
		"updated_by":  job.UpdatedBy,
		"created_at":  job.CreatedAt,
		"updated_at":  job.UpdatedAt,
		"last_run_at": job.LastRunAt,
		"last_status": job.LastStatus,
		"next_run_at": job.NextRunAt,
	}
	if deps != nil && deps.Sched != nil {
		if next := deps.Sched.NextRun(job.ID); !next.IsZero() {
			out["next_run_at"] = next
		}
	}
	return out
}

func cronRunPayload(deps *cronJobsDeps, run *models.CronJobRun) gin.H {
	stdout := run.Stdout
	stderr := run.Stderr
	// stdout/stderr 截断以保护 API 响应:每个字段最大 8 KiB。
	const previewMax = 8 << 10
	stdoutPreview := tailString(stdout, previewMax)
	stderrPreview := tailString(stderr, previewMax)
	running := run.Status == models.CronRunStatusRunning
	if deps != nil && deps.Runner != nil && running {
		running = deps.Runner.IsRunning(run.JobID, run.ID)
	}
	return gin.H{
		"id":              run.ID,
		"job_id":          run.JobID,
		"status":          run.Status,
		"is_running":      running,
		"trigger":         run.Trigger,
		"exit_code":       run.ExitCode,
		"error":           run.Error,
		"started_at":      run.StartedAt,
		"finished_at":     run.FinishedAt,
		"duration_ms":     run.DurationMs,
		"stdout_preview":     stdoutPreview,
		"stderr_preview":     stderrPreview,
		"stdout_truncated":   len(stdout) > previewMax,
		"stderr_truncated":   len(stderr) > previewMax,
		"stdout_size":        int64(len(stdout)),
		"stderr_size":        int64(len(stderr)),
		"log_path":           run.LogPath,
		"created_by":         run.CreatedBy,
	}
}

func validateCronJobInput(in *cronJobInput) error {
	if in == nil {
		return errors.New("请求体为空")
	}
	in.Name = strings.TrimSpace(in.Name)
	in.CronExpr = strings.TrimSpace(in.CronExpr)
	if in.Name == "" {
		return errors.New("任务名称不能为空")
	}
	if len([]rune(in.Name)) > cronJobNameMaxLen {
		return fmt.Errorf("任务名称最长 %d 字符", cronJobNameMaxLen)
	}
	if len([]rune(in.Description)) > cronJobDescMaxLen {
		return fmt.Errorf("描述最长 %d 字符", cronJobDescMaxLen)
	}
	if in.CronExpr == "" {
		return errors.New("cron 表达式不能为空")
	}
	if len(in.CronExpr) > cronJobExprMaxLen {
		return fmt.Errorf("cron 表达式最长 %d 字符", cronJobExprMaxLen)
	}
	if strings.TrimSpace(in.Command) == "" {
		return errors.New("shell 命令不能为空")
	}
	if len(in.Command) > cronJobCommandMaxLen {
		return fmt.Errorf("shell 命令过长(上限 %d 字节)", cronJobCommandMaxLen)
	}
	return nil
}

func parseUint(s string) uint {
	n, _ := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
	return uint(n)
}

func parseInt(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func parseInt64(s string) int64 {
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	return n
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func effectiveLimit(n int) int {
	if n <= 0 {
		return 50
	}
	if n > 500 {
		return 500
	}
	return n
}

func tailString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return "...\n" + s[len(s)-max:]
}