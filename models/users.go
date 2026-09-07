package models

import "time"

// AdminUser 超级管理员账号
type AdminUser struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Username           string    `gorm:"size:64;uniqueIndex;not null" json:"username"`
	PasswordHash       string    `gorm:"size:255;not null" json:"-"`
	MustChangePassword bool      `gorm:"not null;default:false" json:"must_change_password"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

func (AdminUser) TableName() string { return "admin_users" }

// RegularUser 普通用户账号
type RegularUser struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Username           string    `gorm:"size:64;uniqueIndex;not null" json:"username"`
	PasswordHash       string    `gorm:"size:255;not null" json:"-"`
	MustChangePassword bool      `gorm:"not null;default:false" json:"must_change_password"`
	Disabled           bool      `gorm:"not null;default:false" json:"disabled"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

func (RegularUser) TableName() string { return "regular_users" }
