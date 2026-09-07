package models

import "time"

// CronJob 定时任务定义。
// CronExpr 使用标准 5 段 cron 表达式(分 时 日 月 周),通过 robfig/cron 解析。
// Command 是要交给 /bin/sh -c 执行的 shell 脚本片段,允许任意复杂度的管道 / 重定向。
// Enabled 控制是否纳入调度;手动触发不受 Enabled 限制。
type CronJob struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:128;not null" json:"name"`
	Description string    `gorm:"size:512" json:"description"`
	CronExpr    string    `gorm:"size:128;not null" json:"cron_expr"`
	Command     string    `gorm:"type:text;not null" json:"command"`
	Enabled     bool      `gorm:"not null;default:true;index" json:"enabled"`
	CreatedBy   string    `gorm:"size:64" json:"created_by"`
	UpdatedBy   string    `gorm:"size:64" json:"updated_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	LastRunAt    *time.Time `gorm:"index" json:"last_run_at,omitempty"`
	LastStatus   string     `gorm:"size:16" json:"last_status,omitempty"`
	NextRunAt    *time.Time `gorm:"index" json:"next_run_at,omitempty"`
}

func (CronJob) TableName() string { return "cron_jobs" }

// CronJobRun 单次执行记录。
// Stdout / Stderr 在执行结束后会复制到数据库(可能很大),
// 同时通过 LogPath 指向日志文件的相对路径,便于按需读取大日志。
type CronJobRun struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	JobID      uint       `gorm:"index;not null" json:"job_id"`
	Status     string     `gorm:"size:16;not null;index" json:"status"`
	Trigger    string     `gorm:"size:16;not null" json:"trigger"`
	ExitCode   *int       `json:"exit_code,omitempty"`
	Error      string     `gorm:"type:text" json:"error,omitempty"`
	StartedAt  time.Time  `gorm:"index" json:"started_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	DurationMs int64      `json:"duration_ms"`
	Stdout     string     `gorm:"type:text" json:"stdout"`
	Stderr     string     `gorm:"type:text" json:"stderr"`
	LogPath    string     `gorm:"size:512" json:"log_path"`
	CreatedBy  string     `gorm:"size:64" json:"created_by"`
}

func (CronJobRun) TableName() string { return "cron_job_runs" }

const (
	CronRunStatusRunning  = "running"
	CronRunStatusSuccess  = "success"
	CronRunStatusFailed   = "failed"
	CronRunStatusCanceled = "canceled"

	CronTriggerSchedule = "schedule"
	CronTriggerManual   = "manual"
)