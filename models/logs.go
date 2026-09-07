package models

import "time"

// LogLevel 日志级别。
type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

// Log 通用日志条目。每条记录可以关联 0~N 张图片（用于保存现场截图）。
type Log struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Level      LogLevel  `gorm:"size:16;not null;index" json:"level"`
	Source     string    `gorm:"size:64;not null;index" json:"source"`
	Title      string    `gorm:"size:255;not null" json:"title"`
	Message    string    `gorm:"type:text" json:"message"`
	UserID     *uint     `gorm:"index" json:"user_id,omitempty"`
	UserKind   *UserKind `gorm:"size:16" json:"user_kind,omitempty"`
	Username   string    `gorm:"size:64" json:"username,omitempty"`
	Method     string    `gorm:"size:8" json:"method,omitempty"`
	Path       string    `gorm:"size:255;index" json:"path,omitempty"`
	StatusCode *int      `json:"status_code,omitempty"`
	IP         string    `gorm:"size:64" json:"ip,omitempty"`
	UserAgent  string    `gorm:"size:255" json:"user_agent,omitempty"`
	DurationMs *int      `json:"duration_ms,omitempty"`
	Metadata   string    `gorm:"type:text" json:"metadata,omitempty"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}

func (Log) TableName() string { return "logs" }

// LogImage 日志 ↔ 附件 多对多。一条日志可挂多张截图,同一张截图可被多条日志引用。
type LogImage struct {
	LogID        uint `gorm:"primaryKey" json:"log_id"`
	AttachmentID uint `gorm:"primaryKey" json:"attachment_id"`
	SortOrder    int  `gorm:"not null;default:0" json:"sort_order"`
}

func (LogImage) TableName() string { return "log_images" }