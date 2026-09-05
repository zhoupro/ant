package datadb

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"gorm.io/driver/sqlite"
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
	return gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
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

func ListForeignKeys(gdb *gorm.DB, table string) ([]ForeignKey, error) {
	var rows []ForeignKey
	q := fmt.Sprintf("PRAGMA foreign_key_list(%q)", table)
	if err := gdb.Raw(q).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}