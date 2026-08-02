package db

import (
	"log"
	"os"
	"path/filepath"

	"mc/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(dbPath string) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("failed to create db dir: %v", err)
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}

	if err := DB.AutoMigrate(&models.Note{}); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}
	log.Printf("db ready at %s", dbPath)
}