package models

import "time"

type Note struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Title     string    `gorm:"size:200;not null" json:"title"`
	Content   string    `gorm:"type:text" json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type User struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Username           string    `gorm:"size:64;uniqueIndex;not null" json:"username"`
	PasswordHash       string    `gorm:"size:255;not null" json:"-"`
	MustChangePassword bool      `gorm:"not null;default:false" json:"must_change_password"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type Session struct {
	Token     string    `gorm:"primaryKey;size:64" json:"-"`
	UserID    uint      `gorm:"index;not null" json:"-"`
	ExpiresAt time.Time `gorm:"index" json:"-"`
	CreatedAt time.Time `json:"-"`
}