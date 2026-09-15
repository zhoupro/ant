package models

// 日志相关枚举仍保留在 models 包里(其他地方复用),持久化类型与表已迁移
// 到 mc/logentries 包并落入受管 SQLite,这样日志能像其他业务表一样通过
// 页面配置 + 逻辑模型进行展示。

// LogLevel 日志级别。
type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)