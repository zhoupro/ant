package dashboards

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"mc/datadb"
	"gorm.io/gorm"
)

const (
	tableDashboards = "dashboards"
	tableCards      = "dashboard_cards"

	// KindNumber 数字 / 表格卡片 —— 执行 SQL 后把每一行的字段直接展示出来,
	// 单行单列即表现为大数字,多行多列即表现为紧凑表格。
	KindNumber = "number"
	// KindLineChart 折线图卡片 —— X 轴为 1 列,Y 轴可勾选多个数值列,
	// 图例可点击切换显隐;适用于天气趋势、销售走势等场景。
	KindLineChart = "line_chart"
)

var idRe = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// Dashboard 一组卡片的容器;多条卡片组合后即可挂到 pages 表上作为一个聚合页。
// Slug 用作 API 路由中的稳定 ID,Label 是给运营人员看的展示名。
type Dashboard struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	Slug      string    `gorm:"size:64;not null;uniqueIndex:idx_dashboards_slug" json:"slug"`
	Label     string    `gorm:"size:128;not null" json:"label"`
	Icon      string    `gorm:"size:64" json:"icon"`
	Sort      int       `json:"sort"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Dashboard) TableName() string { return tableDashboards }

// Card 单个统计卡片。SQL 始终针对受管库执行(只读),
// Kind 决定前端渲染方式,Config 是卡片级别的额外参数(JSON)。
type Card struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	DashboardID string    `gorm:"size:64;not null;index:idx_cards_dashboard" json:"dashboard_id"`
	Title       string    `gorm:"size:128;not null" json:"title"`
	Kind        string    `gorm:"size:32;not null;default:'number'" json:"kind"`
	SQL         string    `gorm:"type:text;not null" json:"sql"`
	Config      string    `gorm:"type:text" json:"config"`
	Sort        int       `json:"sort"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Card) TableName() string { return tableCards }

// CardConfig 卡片渲染参数。
// NumberCard 可指定 unit(单位 / 后缀,例如 "¥"、"%"、"次")与 decimals(小数位),
// LineChart 用 x_column 标记 X 轴列名、y_columns 列举出 Y 轴候选;
// columns 为「列名 -> 友好展示名」映射,缺省即使用 SQL 里的原始列名。
type CardConfig struct {
	Unit      string            `json:"unit,omitempty"`
	Decimals  int               `json:"decimals,omitempty"`
	XColumn   string            `json:"x_column,omitempty"`
	YColumns  []string          `json:"y_columns,omitempty"`
	Columns   map[string]string `json:"columns,omitempty"`
}

// Decode 解析 Card.Config 为结构化对象;为空时返回零值而非错误。
func (c *Card) Decode() (CardConfig, error) {
	if c == nil {
		return CardConfig{}, nil
	}
	cfg := CardConfig{}
	s := strings.TrimSpace(c.Config)
	if s == "" {
		return cfg, nil
	}
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return cfg, fmt.Errorf("卡片配置不是合法 JSON: %w", err)
	}
	return cfg, nil
}

// Encode 把结构化配置序列化回 JSON 字符串。
func (c *CardConfig) Encode() (string, error) {
	if c == nil {
		return "", nil
	}
	b, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Store 同时管理 dashboards 与 dashboard_cards 两张表,与 logicmodels / pages
// 共用同一份受管库句柄,因此受管库切换会自动迁移两表的数据。
type Store struct {
	mgr    *datadb.Manager
	mu     sync.Mutex
	cached *gorm.DB
}

func NewStore(mgr *datadb.Manager) *Store { return &Store{mgr: mgr} }

// db 拿到当前的受管库 GORM 句柄,首次会做 AutoMigrate。
func (s *Store) db() (*gorm.DB, error) {
	if s.mgr == nil {
		return nil, errors.New("统计中心存储未初始化")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	gdb, err := s.mgr.Current()
	if err != nil {
		return nil, err
	}
	if s.cached != gdb {
		if err := gdb.AutoMigrate(&Dashboard{}, &Card{}); err != nil {
			return nil, fmt.Errorf("初始化统计中心表失败: %w", err)
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

// --- Dashboard CRUD ----------------------------------------------------------

func (s *Store) ListDashboards() ([]Dashboard, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var rows []Dashboard
	if err := gdb.Order("sort asc, created_at asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) GetDashboard(id string) (*Dashboard, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var row Dashboard
	if err := gdb.First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) CreateDashboard(in Dashboard) (*Dashboard, error) {
	if err := s.validateDashboard(&in); err != nil {
		return nil, err
	}
	in.ID = newID("db")
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Create(&in).Error; err != nil {
		return nil, err
	}
	return &in, nil
}

func (s *Store) UpdateDashboard(id string, in Dashboard) (*Dashboard, error) {
	if err := s.validateDashboard(&in); err != nil {
		return nil, err
	}
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Model(&Dashboard{}).Where("id = ?", id).Updates(map[string]any{
		"slug":       in.Slug,
		"label":      in.Label,
		"icon":       in.Icon,
		"sort":       in.Sort,
		"updated_at": time.Now(),
	}).Error; err != nil {
		return nil, err
	}
	return s.GetDashboard(id)
}

func (s *Store) DeleteDashboard(id string) error {
	gdb, err := s.db()
	if err != nil {
		return err
	}
	// 先级联删卡片,再删容器,与 pages.Delete 的写法保持一致。
	if err := gdb.Where("dashboard_id = ?", id).Delete(&Card{}).Error; err != nil {
		return err
	}
	return gdb.Where("id = ?", id).Delete(&Dashboard{}).Error
}

func (s *Store) validateDashboard(in *Dashboard) error {
	if in == nil {
		return errors.New("统计中心为空")
	}
	if !idRe.MatchString(strings.TrimSpace(in.Slug)) {
		return errors.New("slug 必须以小写字母开头,只能包含小写字母、数字、下划线、连字符")
	}
	if strings.TrimSpace(in.Label) == "" {
		return errors.New("展示名不能为空")
	}
	return nil
}

// --- Card CRUD ----------------------------------------------------------------

func (s *Store) ListCards(dashboardID string) ([]Card, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var rows []Card
	if err := gdb.Where("dashboard_id = ?", dashboardID).
		Order("sort asc, created_at asc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) GetCard(id string) (*Card, error) {
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	var row Card
	if err := gdb.First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) CreateCard(in Card) (*Card, error) {
	if err := s.validateCard(&in); err != nil {
		return nil, err
	}
	in.ID = newID("dc")
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Create(&in).Error; err != nil {
		return nil, err
	}
	return &in, nil
}

func (s *Store) UpdateCard(id string, in Card) (*Card, error) {
	if err := s.validateCard(&in); err != nil {
		return nil, err
	}
	gdb, err := s.db()
	if err != nil {
		return nil, err
	}
	if err := gdb.Model(&Card{}).Where("id = ?", id).Updates(map[string]any{
		"dashboard_id": in.DashboardID,
		"title":        strings.TrimSpace(in.Title),
		"kind":         in.Kind,
		"sql":          in.SQL,
		"config":       in.Config,
		"sort":         in.Sort,
		"updated_at":   time.Now(),
	}).Error; err != nil {
		return nil, err
	}
	return s.GetCard(id)
}

func (s *Store) DeleteCard(id string) error {
	gdb, err := s.db()
	if err != nil {
		return err
	}
	return gdb.Where("id = ?", id).Delete(&Card{}).Error
}

func (s *Store) validateCard(in *Card) error {
	if in == nil {
		return errors.New("卡片为空")
	}
	if strings.TrimSpace(in.Title) == "" {
		return errors.New("卡片标题不能为空")
	}
	if strings.TrimSpace(in.SQL) == "" {
		return errors.New("卡片 SQL 不能为空")
	}
	switch in.Kind {
	case KindNumber, KindLineChart:
	default:
		return fmt.Errorf("卡片类型 %q 不支持", in.Kind)
	}
	if _, err := SanitizeSQL(in.SQL); err != nil {
		return fmt.Errorf("SQL 校验失败: %w", err)
	}
	return nil
}

// AllowedIcons 出现在卡片编辑器下拉里的图标。沿用 pages.AllowedIcons 以保证风格统一。
var AllowedIcons = []string{
	"BarChart", "LineChart", "PieChart", "LayoutDashboard",
	"Database", "Sparkles", "Star", "Cloud", "Server",
}

var idCounter uint64

func newID(prefix string) string {
	idCounter++
	return fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixNano(), idCounter)
}