package models

import "time"

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

type Attachment struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	OriginalName string    `gorm:"size:255;not null" json:"original_name"`
	StoredName   string    `gorm:"size:255;not null" json:"-"`
	Size         int64     `gorm:"not null" json:"size"`
	ContentType  string    `gorm:"size:128" json:"content_type"`
	CreatedAt    time.Time `json:"created_at"`
}

type Setting struct {
	Key       string    `gorm:"primaryKey;size:64" json:"key"`
	Value     string    `gorm:"type:text;not null" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

type LogicModel struct {
	Slug        string    `gorm:"primaryKey;size:64" json:"slug"`
	Label       string    `gorm:"size:128;not null" json:"label"`
	Description string    `gorm:"type:text" json:"description"`
	Config      string    `gorm:"type:text;not null" json:"config"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
