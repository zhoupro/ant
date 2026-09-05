package pages

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"mc/datadb"
	"gorm.io/gorm"
)

var slugRe = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

const tableName = "pages"

type Page struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	Slug      string    `gorm:"size:64;not null;uniqueIndex:idx_pages_slug" json:"slug"`
	Label     string    `gorm:"size:128;not null" json:"label"`
	Icon      string    `gorm:"size:64" json:"icon"`
	ParentID  string    `gorm:"size:64;index" json:"parent_id"`
	ModelSlug string    `gorm:"size:64" json:"model_slug"`
	Sort      int       `json:"sort"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Page) TableName() string { return tableName }

// Store keeps the current *gorm.DB handle and lazily re-runs AutoMigrate
// when the managed database is reloaded. This mirrors the design used by
// logicmodels.Store so that pages live alongside the data they reference.
type Store struct {
	mgr    *datadb.Manager
	mu     sync.Mutex
	cached *gorm.DB
}

func NewStore(mgr *datadb.Manager) *Store { return &Store{mgr: mgr} }

func (s *Store) db() (*gorm.DB, error) {
	if s.mgr == nil {
		return nil, errors.New("页面存储未初始化")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	gdb, err := s.mgr.Current()
	if err != nil {
		return nil, err
	}
	if s.cached != gdb {
		if err := gdb.AutoMigrate(&Page{}); err != nil {
			return nil, fmt.Errorf("初始化 pages 表失败: %w", err)
		}
		s.cached = gdb
	}
	return gdb, nil
}

func (s *Store) ResetCache() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

func (s *Store) List() ([]Page, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var rows []Page
	if err := gdb.Order("sort asc, created_at asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) Get(id string) (*Page, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var row Page
	if err := gdb.First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) Create(in Page) (*Page, error) {
	if err := s.validate(&in, true); err != nil {
		return nil, err
	}
	in.ID = newID()
	in.CreatedAt = time.Time{}
	in.UpdatedAt = time.Time{}
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Create(&in).Error; err != nil {
		return nil, err
	}
	return &in, nil
}

func (s *Store) Update(id string, in Page) (*Page, error) {
	if err := s.validate(&in, false); err != nil {
		return nil, err
	}
	in.ID = id
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Model(&Page{}).Where("id = ?", id).Updates(map[string]any{
		"slug":       in.Slug,
		"label":      in.Label,
		"icon":       in.Icon,
		"parent_id":  in.ParentID,
		"model_slug": in.ModelSlug,
		"sort":       in.Sort,
		"updated_at": time.Now(),
	}).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *Store) Delete(id string) error {
	gdb, err := s.db()
	if err != nil {
		return err
	}
	// Cascade: delete children first.
	if err := gdb.Where("parent_id = ?", id).Delete(&Page{}).Error; err != nil {
		return err
	}
	return gdb.Where("id = ?", id).Delete(&Page{}).Error
}

func (s *Store) validate(in *Page, isCreate bool) error {
	if in == nil {
		return errors.New("页面为空")
	}
	if strings.TrimSpace(in.Slug) == "" {
		return errors.New("slug 不能为空")
	}
	if !slugRe.MatchString(in.Slug) {
		return errors.New("slug 必须以小写字母开头,只能包含小写字母、数字、下划线、连字符")
	}
	if strings.TrimSpace(in.Label) == "" {
		return errors.New("展示名不能为空")
	}
	if in.Icon != "" && !IsValidIcon(in.Icon) {
		return fmt.Errorf("图标 %q 无效", in.Icon)
	}
	if in.ParentID != "" {
		// Verify the parent exists and is itself a top-level page.
		parent, err := s.Get(in.ParentID)
		if err != nil {
			return fmt.Errorf("父级页面不存在")
		}
		if parent.ParentID != "" {
			return errors.New("仅支持最多两级页面,父级必须是顶级")
		}
	}
	return nil
}

// AllowedIcons is the closed set of lucide-react icon names available in the
// page editor. Restricted on purpose so a malformed value cannot reach the
// frontend bundle.
var AllowedIcons = []string{
	"LayoutDashboard", "Home", "FileText", "Files", "Folder", "BookOpen",
	"Users", "User", "ShoppingCart", "Package", "Tag", "Tags", "Box",
	"BarChart", "PieChart", "LineChart", "Database", "Server", "Cloud",
	"ListChecks", "ClipboardList", "Inbox", "MessageSquare", "Mail",
	"Calendar", "Clock", "Settings", "Wrench", "Sparkles", "Star", "Heart",
	"Image", "Camera", "Music", "Video", "BookMarked", "Bookmark",
}

func IsValidIcon(name string) bool {
	if name == "" {
		return true
	}
	for _, v := range AllowedIcons {
		if v == name {
			return true
		}
	}
	return false
}

var idCounter uint64

func newID() string {
	idCounter++
	return fmt.Sprintf("pg_%d_%d", time.Now().UnixNano(), idCounter)
}
