package settings

import (
	"log"
	"sync"

	"mc/db"
	"mc/models"
)

const (
	KeyUploadRoot     = "upload_root"
	KeyManagedDBPath  = "managed_db_path"
)

type Store struct {
	mu       sync.RWMutex
	defaults map[string]string
}

func New() *Store {
	return &Store{defaults: map[string]string{}}
}

func (s *Store) SetDefault(key, value string) {
	s.mu.Lock()
	s.defaults[key] = value
	s.mu.Unlock()
	db.SetDefault(key, value)
}

func (s *Store) Default(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.defaults[key]
}

func (s *Store) Get(key string) (string, bool) {
	var row models.Setting
	if err := db.DB.First(&row, "key = ?", key).Error; err != nil {
		return "", false
	}
	if row.Value != "" {
		return row.Value, true
	}
	s.mu.RLock()
	def, ok := s.defaults[key]
	s.mu.RUnlock()
	return def, ok
}

func (s *Store) GetString(key string) string {
	if v, ok := s.Get(key); ok {
		return v
	}
	return s.Default(key)
}

func (s *Store) Set(key, value string) error {
	var row models.Setting
	err := db.DB.First(&row, "key = ?", key).Error
	if err != nil {
		row = models.Setting{Key: key, Value: value}
		if err := db.DB.Create(&row).Error; err != nil {
			return err
		}
		return nil
	}
	row.Value = value
	if err := db.DB.Save(&row).Error; err != nil {
		return err
	}
	return nil
}

func (s *Store) Snapshot() map[string]string {
	var rows []models.Setting
	if err := db.DB.Find(&rows).Error; err != nil {
		log.Printf("snapshot settings: %v", err)
		return map[string]string{}
	}
	out := make(map[string]string, len(rows)+len(s.defaults))
	for k, v := range s.defaults {
		out[k] = v
	}
	for _, r := range rows {
		if r.Value != "" {
			out[r.Key] = r.Value
		}
	}
	return out
}
