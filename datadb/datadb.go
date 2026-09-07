package datadb

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	ManagedDB = "managed.db"
)

type Status struct {
	Loaded   bool   `json:"loaded"`
	Path     string `json:"path,omitempty"`
	Name     string `json:"name,omitempty"`
	Size     int64  `json:"size,omitempty"`
	Tables   int    `json:"tables,omitempty"`
	Error    string `json:"error,omitempty"`
}

type Manager struct {
	mu   sync.RWMutex
	db   *gorm.DB
	path string
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Status() Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.db == nil {
		return Status{Loaded: false}
	}
	tables, _ := listTablesLocked(m.db)
	info, err := os.Stat(m.path)
	size := int64(0)
	if err == nil {
		size = info.Size()
	}
	return Status{
		Loaded: true,
		Path:   m.path,
		Name:   filepath.Base(m.path),
		Size:   size,
		Tables: len(tables),
	}
}

func (m *Manager) Current() (*gorm.DB, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.db == nil {
		return nil, errors.New("未加载数据库")
	}
	return m.db, nil
}

func (m *Manager) Load(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(abs); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("创建目录失败: %w", err)
		}
	}
	gdb, err := openSQLite(abs)
	if err != nil {
		return fmt.Errorf("打开数据库失败: %w", err)
	}
	m.swap(gdb, abs)
	return nil
}

func (m *Manager) Unload() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.db == nil {
		return nil
	}
	sqlDB, err := m.db.DB()
	if err == nil {
		_ = sqlDB.Close()
	}
	m.db = nil
	m.path = ""
	return nil
}

func (m *Manager) swap(db *gorm.DB, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.db != nil {
		if sqlDB, err := m.db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	m.db = db
	m.path = path
	log.Printf("datadb: loaded %s", path)
}

func openSQLite(path string) (*gorm.DB, error) {
	// If the file already exists but is read-only, fix the permission so
	// SQLite can open it in rwc mode. This handles the common case where
	// somebody chmod'd the data file to 444 (or copied it from a ro
	// mount) and every subsequent write returned "readonly database".
	if info, statErr := os.Stat(path); statErr == nil && info.Mode().Perm()&0o200 == 0 {
		if chmodErr := os.Chmod(path, 0o644); chmodErr != nil {
			return nil, fmt.Errorf(
				"无法设置 %s 为可写: %w (父目录可能只读或文件被锁定)",
				path, chmodErr,
			)
		}
	}

	// Build a DSN with the right pragmas. Use the explicit `file:` prefix
	// so we can append a query string without worrying about a path that
	// happens to contain `?`.
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)"

	gdb, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}
	// Force a checkpoint after every write so a SIGKILL never leaves the
	// configured database half-updated on disk. The PRAGMA runs in the
	// same connection as the originating write, so the WAL has already
	// been flushed to the main DB file by the time we return.
	gdb.Callback().Create().After("gorm:after_create").Register("mc:wal_checkpoint", func(tx *gorm.DB) {
		_ = tx.Exec("PRAGMA wal_checkpoint(TRUNCATE)").Error
	})
	gdb.Callback().Update().After("gorm:after_update").Register("mc:wal_checkpoint", func(tx *gorm.DB) {
		_ = tx.Exec("PRAGMA wal_checkpoint(TRUNCATE)").Error
	})
	gdb.Callback().Delete().After("gorm:after_delete").Register("mc:wal_checkpoint", func(tx *gorm.DB) {
		_ = tx.Exec("PRAGMA wal_checkpoint(TRUNCATE)").Error
	})
	return gdb, nil
}

func listTablesLocked(gdb *gorm.DB) ([]string, error) {
	type row struct {
		Name string
	}
	var rows []row
	err := gdb.Raw(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.Name != "" {
			out = append(out, r.Name)
		}
	}
	return out, nil
}

type ForeignKey struct {
	ID       int    `gorm:"column:id"`
	Seq      int    `gorm:"column:seq"`
	Table    string `gorm:"column:table"`
	From     string `gorm:"column:from"`
	To       string `gorm:"column:to"`
	OnUpdate string `gorm:"column:on_update"`
	OnDelete string `gorm:"column:on_delete"`
	Match    string `gorm:"column:match"`
}

// ExplainDBError turns cryptic SQLite errors into actionable hints for the
// UI. Anything we don't recognise passes through unchanged.
func ExplainDBError(err error) (string, string) {
	if err == nil {
		return "", ""
	}
	msg := err.Error()
	switch {
	case strings.Contains(msg, "readonly"):
		return "数据库为只读,无法写入", "managed.db 文件被设成 444,或其所在目录被设成 555/挂载为只读文件系统。检查文件权限并重试。"
	case strings.Contains(msg, "no such table"):
		return "数据表不存在", "可能是模型刚刚被删除,或 GORM 还未完成迁移。"
	case strings.Contains(msg, "UNIQUE constraint failed"):
		return "违反唯一约束", "该字段在已有数据中已存在重复值。"
	case strings.Contains(msg, "FOREIGN KEY constraint failed"):
		return "违反外键约束", "该记录被其他表引用,需要先删除或解除引用。"
	}
	return msg, ""
}

func ListForeignKeys(gdb *gorm.DB, table string) ([]ForeignKey, error) {
	var rows []ForeignKey
	q := fmt.Sprintf("PRAGMA foreign_key_list(%q)", table)
	if err := gdb.Raw(q).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}