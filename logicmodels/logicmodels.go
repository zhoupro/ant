package logicmodels

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"mc/db"
	"mc/models"
)

var slugRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

type RelationType string

const (
	RelOneToOne   RelationType = "one_to_one"
	RelOneToMany  RelationType = "one_to_many"
	RelManyToMany RelationType = "many_to_many"
)

type FieldConfig struct {
	Key          string         `json:"key"`
	Physical     string         `json:"physical"`
	Label        string         `json:"label"`
	BusinessType string         `json:"business_type"`
	Required     bool           `json:"required"`
	Editable     bool           `json:"editable"`
	ListShow     bool           `json:"list_show"`
	Searchable   bool           `json:"searchable"`
	Sort         int            `json:"sort"`
	Placeholder  string         `json:"placeholder,omitempty"`
	Options      []SelectOption `json:"options,omitempty"`
}

type SelectOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type TableConfig struct {
	Alias      string        `json:"alias"`
	Physical   string        `json:"physical"`
	Label      string        `json:"label"`
	PrimaryKey string        `json:"primary_key"`
	Fields     []FieldConfig `json:"fields"`
}

type RelationConfig struct {
	ID              string       `json:"id"`
	Type            RelationType `json:"type"`
	FromAlias       string       `json:"from_alias"`
	FromColumn      string       `json:"from_column"`
	ToAlias         string       `json:"to_alias"`
	ToColumn        string       `json:"to_column"`
	JoinTable       string       `json:"join_table,omitempty"`
	JoinFromColumn  string       `json:"join_from_column,omitempty"`
	JoinToColumn    string       `json:"join_to_column,omitempty"`
	Label           string       `json:"label,omitempty"`
}

type ModelConfig struct {
	RootAlias   string           `json:"root_alias"`
	Tables      []TableConfig    `json:"tables"`
	Relations   []RelationConfig `json:"relations"`
}

type Store struct{}

func NewStore() *Store { return &Store{} }

func (s *Store) List() ([]models.LogicModel, error) {
	var rows []models.LogicModel
	if err := db.DB.Order("updated_at desc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) Get(slug string) (*models.LogicModel, error) {
	var row models.LogicModel
	if err := db.DB.First(&row, "slug = ?", slug).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) Upsert(slug string, label string, description string, cfg ModelConfig) (*models.LogicModel, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	if strings.TrimSpace(label) == "" {
		return nil, errors.New("展示名不能为空")
	}
	if err := validateConfig(&cfg); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("序列化配置失败: %w", err)
	}
	now := time.Now()
	var row models.LogicModel
	err = db.DB.First(&row, "slug = ?", slug).Error
	if err != nil {
		row = models.LogicModel{
			Slug:        slug,
			Label:       label,
			Description: description,
			Config:      string(payload),
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := db.DB.Create(&row).Error; err != nil {
			return nil, err
		}
		return &row, nil
	}
	row.Label = label
	row.Description = description
	row.Config = string(payload)
	row.UpdatedAt = now
	if err := db.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) Delete(slug string) error {
	return db.DB.Where("slug = ?", slug).Delete(&models.LogicModel{}).Error
}

func validateSlug(slug string) error {
	slug = strings.TrimSpace(slug)
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("唯一名字必须以小写字母开头,只能包含小写字母、数字与下划线")
	}
	return nil
}

func validateConfig(cfg *ModelConfig) error {
	if cfg == nil {
		return errors.New("配置为空")
	}
	if len(cfg.Tables) == 0 {
		return errors.New("至少选择一个表")
	}
	aliasSet := map[string]*TableConfig{}
	for i := range cfg.Tables {
		t := &cfg.Tables[i]
		if t.Alias == "" || t.Physical == "" {
			return errors.New("表的别名与物理表名不能为空")
		}
		if _, ok := aliasSet[t.Alias]; ok {
			return fmt.Errorf("表别名重复: %s", t.Alias)
		}
		aliasSet[t.Alias] = t
		if t.PrimaryKey == "" {
			return fmt.Errorf("表 %s 缺少主键字段", t.Alias)
		}
		seenFields := map[string]struct{}{}
		for j := range t.Fields {
			f := &t.Fields[j]
			if f.Key == "" || f.Physical == "" {
				return fmt.Errorf("表 %s 的字段缺少 key/physical", t.Alias)
			}
			if _, ok := seenFields[f.Key]; ok {
				return fmt.Errorf("表 %s 字段 key 重复: %s", t.Alias, f.Key)
			}
			seenFields[f.Key] = struct{}{}
			if f.BusinessType == "" {
				f.BusinessType = "text"
			}
			if !IsValidBusinessType(f.BusinessType) {
				return fmt.Errorf("表 %s 字段 %s 的业务类型无效: %s", t.Alias, f.Key, f.BusinessType)
			}
			if (f.BusinessType == "select" || f.BusinessType == "multiselect") && len(f.Options) == 0 {
				return fmt.Errorf("表 %s 字段 %s 使用 %s 时必须配置选项", t.Alias, f.Key, f.BusinessType)
			}
		}
	}
	if cfg.RootAlias == "" {
		cfg.RootAlias = cfg.Tables[0].Alias
	}
	if _, ok := aliasSet[cfg.RootAlias]; !ok {
		return fmt.Errorf("根表别名不存在: %s", cfg.RootAlias)
	}
	for i := range cfg.Relations {
		r := &cfg.Relations[i]
		if _, ok := aliasSet[r.FromAlias]; !ok {
			return fmt.Errorf("关系 %d: 来源表别名 %s 不存在", i, r.FromAlias)
		}
		if _, ok := aliasSet[r.ToAlias]; !ok {
			return fmt.Errorf("关系 %d: 目标表别名 %s 不存在", i, r.ToAlias)
		}
		switch r.Type {
		case RelOneToOne, RelOneToMany:
			if r.FromColumn == "" || r.ToColumn == "" {
				return fmt.Errorf("关系 %d: 必须填写来源/目标字段", i)
			}
		case RelManyToMany:
			if r.JoinTable == "" || r.JoinFromColumn == "" || r.JoinToColumn == "" {
				return fmt.Errorf("关系 %d: 多对多必须填写关联表与字段", i)
			}
		default:
			return fmt.Errorf("关系 %d: 类型无效 %q", i, r.Type)
		}
	}
	return nil
}

func Decode(row *models.LogicModel) (ModelConfig, error) {
	var cfg ModelConfig
	if row == nil {
		return cfg, errors.New("记录为空")
	}
	if err := json.Unmarshal([]byte(row.Config), &cfg); err != nil {
		return cfg, fmt.Errorf("配置解析失败: %w", err)
	}
	return cfg, nil
}

func BusinessTypes() []string {
	return []string{
		"text",
		"longtext",
		"number",
		"integer",
		"boolean",
		"date",
		"datetime",
		"image",
		"images",
		"file",
		"json",
		"richtext",
		"select",
		"multiselect",
		"url",
		"email",
		"phone",
		"color",
	}
}

func IsValidBusinessType(t string) bool {
	for _, v := range BusinessTypes() {
		if v == t {
			return true
		}
	}
	return false
}

func BusinessTypeLabel(t string) string {
	switch t {
	case "text":
		return "短文本"
	case "longtext":
		return "长文本"
	case "number":
		return "数字"
	case "integer":
		return "整数"
	case "boolean":
		return "布尔"
	case "date":
		return "日期"
	case "datetime":
		return "日期时间"
	case "image":
		return "图片"
	case "images":
		return "图片集"
	case "file":
		return "文件"
	case "json":
		return "JSON"
	case "richtext":
		return "富文本"
	case "select":
		return "下拉选择"
	case "multiselect":
		return "多选"
	case "url":
		return "网址"
	case "email":
		return "邮箱"
	case "phone":
		return "电话"
	case "color":
		return "颜色"
	}
	return t
}