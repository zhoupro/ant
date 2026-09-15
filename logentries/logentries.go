// Package logentries 把日志条目(logs / log_images)落地到受管 SQLite 数据库,
// 复用通用的 datadb.Manager,使得日志能像其他业务表一样通过页面/逻辑模型
// 配置展示,而不需要走 app.db 的系统表。
//
// 这里保留 models.LogLevel(只是个枚举)以避免循环依赖;所有持久化类型与
// 存取方法都在本包内。
package logentries

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"mc/datadb"
	"mc/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 表名常量,与 datadb.SystemTables 保持一致。
const (
	TableLogs     = "logs"
	TableLogImage = "log_images"
)

// Log 通用日志条目。每条记录可以关联 0~N 张图片(用于保存现场截图)。
// 持久化在受管库中,而非 app.db,以便通过逻辑模型/页面进行展示。
type Log struct {
	ID         uint            `gorm:"primaryKey" json:"id"`
	Level      models.LogLevel `gorm:"size:16;not null;index" json:"level"`
	Source     string          `gorm:"size:64;not null;index" json:"source"`
	Title      string          `gorm:"size:255;not null" json:"title"`
	Message    string          `gorm:"type:text" json:"message"`
	UserID     *uint           `gorm:"index" json:"user_id,omitempty"`
	UserKind   *models.UserKind `gorm:"size:16" json:"user_kind,omitempty"`
	Username   string          `gorm:"size:64" json:"username,omitempty"`
	Method     string          `gorm:"size:8" json:"method,omitempty"`
	Path       string          `gorm:"size:255;index" json:"path,omitempty"`
	StatusCode *int            `json:"status_code,omitempty"`
	IP         string          `gorm:"size:64" json:"ip,omitempty"`
	UserAgent  string          `gorm:"size:255" json:"user_agent,omitempty"`
	DurationMs *int            `json:"duration_ms,omitempty"`
	Metadata   string          `gorm:"type:text" json:"metadata,omitempty"`
	CreatedAt  time.Time       `gorm:"index" json:"created_at"`
}

func (Log) TableName() string { return TableLogs }

// LogImage 日志 ↔ 附件 多对多。一条日志可挂多张截图,同一张截图可被多条日志引用。
// 附件(Attachment)仍位于 app.db —— 跨库通过 ID 关联,在 BuildPayload 中临时合并。
type LogImage struct {
	LogID        uint `gorm:"primaryKey" json:"log_id"`
	AttachmentID uint `gorm:"primaryKey" json:"attachment_id"`
	SortOrder    int  `gorm:"not null;default:0" json:"sort_order"`
}

func (LogImage) TableName() string { return TableLogImage }

// Store 持有 datadb.Manager 句柄,惰性确保 logs/log_images 表存在。
// 与 pages.Store、logicmodels.Store 保持同样的风格,这样受管库一旦切换,
	// 下一次访问就会重新跑 AutoMigrate。
type Store struct {
	mgr    *datadb.Manager
	mu     sync.Mutex
	cached *gorm.DB
}

func NewStore(mgr *datadb.Manager) *Store { return &Store{mgr: mgr} }

// DB 返回受管库的 *gorm.DB,首次访问时确保 logs/log_images 表存在。
func (s *Store) DB() (*gorm.DB, error) {
	if s.mgr == nil {
		return nil, errors.New("日志存储未初始化")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	gdb, err := s.mgr.Current()
	if err != nil {
		return nil, err
	}
	if s.cached != gdb {
		if err := gdb.AutoMigrate(&Log{}, &LogImage{}); err != nil {
			return nil, fmt.Errorf("初始化日志表失败: %w", err)
		}
		s.cached = gdb
	}
	return gdb, nil
}

// ResetCache 在受管库被替换后丢弃缓存,下次访问重新建表。
func (s *Store) ResetCache() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

// Ensure 主动跑一次表初始化,用于启动时显式建表。
func (s *Store) Ensure() error {
	_, err := s.DB()
	return err
}

// Create 把一条日志落库,如果带 imageIDs 还会同时插入 log_images 关联。
// 成功后会把 LastInsertId 与 created_at 回填到 *entry 上,调用方可以直接用
// 这份内存里的对象做后续 JSON 序列化 —— 同连接的事务刚 commit 后,马上
// SELECT 会被 GORM 的连接池拿到另一条空闲连接,极少数情况下会错过提交。
//
// 注意:不显式包 Transaction,因为 datadb.Manager 已经在 gorm 的 Create/Update/
// Delete 回调里挂了一个 wal_checkpoint(TRUNCATE) 钩子,在事务里调用
// tx.Create 会让钩子运行在事务连接上,PRAGMA wal_checkpoint(TRUNCATE) 在
// 持有写入锁的事务里极易触发 "database table is locked"。改为走底层 *sql.DB
// 显式执行 INSERT,既绕开 GORM 钩子,也少一次回调链。
func (s *Store) Create(entry *Log, imageIDs []uint) error {
	if entry == nil {
		return errors.New("entry 为空")
	}
	gdb, err := s.DB()
	if err != nil {
		return err
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		return err
	}
	tx, err := sqlDB.Begin()
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	now := time.Now()
	entry.CreatedAt = now
	res, err := tx.Exec(
		`INSERT INTO logs (level, source, title, message, user_id, user_kind, username,
			method, path, status_code, ip, user_agent, duration_ms, metadata, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.Level, entry.Source, entry.Title, entry.Message,
		entry.UserID, entry.UserKind, entry.Username,
		entry.Method, entry.Path, entry.StatusCode, entry.IP, entry.UserAgent,
		entry.DurationMs, entry.Metadata, now,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	entry.ID = uint(id)
	if len(imageIDs) > 0 {
		unique := dedup(imageIDs)
		for i, attID := range unique {
			if _, err := tx.Exec(
				`INSERT INTO log_images (log_id, attachment_id, sort_order) VALUES (?, ?, ?)`,
				entry.ID, attID, i,
			); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// ListQuery 用于 listLogs 的查询参数。
type ListQuery struct {
	Level  string
	Source string
	Search string
	Limit  int
	Offset int
	Order  string // "asc" / "desc"
}

// List 返回分页结果、total 以及去重后的 levels/sources。
func (s *Store) List(q ListQuery) ([]Log, int64, []string, []string, error) {
	gdb, err := s.DB()
	if err != nil {
		return nil, 0, nil, nil, err
	}
	if q.Limit <= 0 || q.Limit > 200 {
		q.Limit = 50
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	order := "desc"
	if strings.EqualFold(q.Order, "asc") {
		order = "asc"
	}

	tx := gdb.Model(&Log{})
	if q.Level != "" {
		tx = tx.Where("level = ?", q.Level)
	}
	if q.Source != "" {
		tx = tx.Where("source = ?", q.Source)
	}
	if s := strings.TrimSpace(q.Search); s != "" {
		like := "%" + s + "%"
		tx = tx.Where("title LIKE ? OR message LIKE ?", like, like)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, nil, nil, err
	}

	var rows []Log
	if err := tx.Order("created_at " + order).Limit(q.Limit).Offset(q.Offset).Find(&rows).Error; err != nil {
		return nil, 0, nil, nil, err
	}

	levels, sources := s.Facets()
	return rows, total, levels, sources, nil
}

// Get 读取单条日志。
func (s *Store) Get(id string) (*Log, error) {
	gdb, err := s.DB()
	if err != nil {
		return nil, err
	}
	var row Log
	if err := gdb.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// Delete 删除单条日志(同时清理 log_images 关联)。
func (s *Store) Delete(id string) error {
	gdb, err := s.DB()
	if err != nil {
		return err
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		return err
	}
	tx, err := sqlDB.Begin()
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if _, err := tx.Exec(`DELETE FROM log_images WHERE log_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM logs WHERE id = ?`, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// Clear 清空整个日志表(以及关联表)。
func (s *Store) Clear() error {
	gdb, err := s.DB()
	if err != nil {
		return err
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		return err
	}
	tx, err := sqlDB.Begin()
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if _, err := tx.Exec(`DELETE FROM log_images`); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM logs`); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// Facets 返回去重后的 level / source 列表。
func (s *Store) Facets() ([]string, []string) {
	levels := []string{
		string(models.LogLevelDebug),
		string(models.LogLevelInfo),
		string(models.LogLevelWarn),
		string(models.LogLevelError),
	}
	var rawSources []string
	if gdb, err := s.DB(); err == nil {
		gdb.Model(&Log{}).
			Distinct("source").
			Where("source <> ''").
			Pluck("source", &rawSources)
	}
	sources := make([]string, 0, len(rawSources))
	for _, s := range rawSources {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		sources = append(sources, s)
	}
	return levels, sources
}

// AppendImages 给已有日志追加若干附件关联。
func (s *Store) AppendImages(logID uint, imageIDs []uint) error {
	if len(imageIDs) == 0 {
		return nil
	}
	gdb, err := s.DB()
	if err != nil {
		return err
	}
	unique := dedup(imageIDs)
	rows := make([]LogImage, 0, len(unique))
	for i, id := range unique {
		rows = append(rows, LogImage{
			LogID:        logID,
			AttachmentID: id,
			SortOrder:    i,
		})
	}
	return gdb.Create(&rows).Error
}

func dedup(in []uint) []uint {
	seen := make(map[uint]struct{}, len(in))
	out := make([]uint, 0, len(in))
	for _, v := range in {
		if v == 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// Compile-time assertion: gin.H is the response type. We don't actually use
// gin here but keep the import marker for downstream packages that build
// payloads alongside us.
var _ = gin.H{}