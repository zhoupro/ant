package db

import (
	"log"
	"os"
	"path/filepath"

	"mc/models"

	"golang.org/x/crypto/bcrypt"
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

	if err := DB.AutoMigrate(&models.User{}, &models.Session{}); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}

	seedDefaultUser()
	log.Printf("db ready at %s", dbPath)
}

func seedDefaultUser() {
	var count int64
	if err := DB.Model(&models.User{}).Count(&count).Error; err != nil {
		log.Fatalf("failed to count users: %v", err)
	}
	if count > 0 {
		return
	}
	createDefaultUser("test123")
	log.Printf("seeded default user 'test' (must change password on first login)")
}

func ResetDefaultUser(password string) error {
	if err := DB.Where("username = ?", "test").Delete(&models.User{}).Error; err != nil {
		return err
	}
	if err := DB.Where("token <> ?", "").Delete(&models.Session{}).Error; err != nil {
		return err
	}
	createDefaultUser(password)
	return nil
}

func createDefaultUser(password string) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("failed to hash default password: %v", err)
	}
	user := models.User{
		Username:           "test",
		PasswordHash:       string(hash),
		MustChangePassword: true,
	}
	if err := DB.Create(&user).Error; err != nil {
		log.Fatalf("failed to seed default user: %v", err)
	}
}
