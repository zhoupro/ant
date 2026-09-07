package models

import "time"

type UserKind string

const (
	UserKindAdmin   UserKind = "admin"
	UserKindRegular UserKind = "regular"
)

type Session struct {
	Token     string    `gorm:"primaryKey;size:64" json:"-"`
	UserID    uint      `gorm:"index;not null" json:"-"`
	UserKind  UserKind  `gorm:"size:16;not null;default:admin" json:"-"`
	ExpiresAt time.Time `gorm:"index" json:"-"`
	CreatedAt time.Time `json:"-"`
}

type Attachment struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	UserKind     UserKind  `gorm:"size:16;not null;default:admin" json:"user_kind"`
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

type APIToken struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"index;not null" json:"user_id"`
	UserKind   UserKind   `gorm:"size:16;not null;default:admin" json:"user_kind"`
	Name       string     `gorm:"size:64;not null" json:"name"`
	Prefix     string     `gorm:"size:16;not null" json:"prefix"`
	TokenHash  string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	Plain      string     `gorm:"size:128" json:"-"`
	ExpiresAt  *time.Time `gorm:"index" json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	RevokedAt  *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}
