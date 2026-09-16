// Package seed 在启动时为受管 SQLite 配置一组默认的逻辑模型与页面,
// 让用户首次打开就能看到「日志」页等内置入口,而不是一片空白。
package seed

import (
	"fmt"
	"log"

	"mc/logentries"
	"mc/logicmodels"
	"mc/pages"
)

// LogModelSlug 与 LogPageSlug 是默认日志页面和逻辑模型的固定标识,
// 同时作为幂等检查的"指纹"。
const (
	LogModelSlug = "auto_logs"
	LogPageSlug  = "logs"
)

// EnsureLogSchema 主动跑一次日志表初始化。受管库被替换时由调用方负责
// 触发 logentries.Store.ResetCache()。
func EnsureLogSchema(store *logentries.Store) error {
	if store == nil {
		return fmt.Errorf("logentries.Store 为空")
	}
	if err := store.Ensure(); err != nil {
		return fmt.Errorf("初始化日志表失败: %w", err)
	}
	return nil
}

// defaultLogsModelConfig 返回 auto_logs 的默认字段配置。字段与
// logentries.Log 一一对应,字段顺序即为前端列表展示顺序。
func defaultLogsModelConfig() logicmodels.ModelConfig {
	return logicmodels.ModelConfig{
		RootAlias: logentries.TableLogs,
		Tables: []logicmodels.TableConfig{
			{
				Alias:      logentries.TableLogs,
				Physical:   logentries.TableLogs,
				Label:      "日志",
				PrimaryKey: "id",
				Fields: []logicmodels.FieldConfig{
					{
						Key:          "created_at",
						Physical:     "created_at",
						Label:        "时间",
						BusinessType: "datetime",
						Required:     false,
						Editable:     false,
						ListShow:     true,
						Searchable:   false,
						Sort:         0,
						Default:      logicmodels.DefaultSentinelNow,
					},
					{
						Key:          "level",
						Physical:     "level",
						Label:        "级别",
						BusinessType: "select",
						Required:     false,
						Editable:     true,
						ListShow:     true,
						Searchable:   true,
						Sort:         1,
						Options: []logicmodels.SelectOption{
							{Label: "调试", Value: "debug"},
							{Label: "信息", Value: "info"},
							{Label: "警告", Value: "warn"},
							{Label: "错误", Value: "error"},
						},
					},
					{
						Key:          "source",
						Physical:     "source",
						Label:        "来源",
						BusinessType: "text",
						Required:     false,
						Editable:     true,
						ListShow:     true,
						Searchable:   true,
						Sort:         2,
					},
					{
						Key:          "title",
						Physical:     "title",
						Label:        "标题",
						BusinessType: "text",
						Required:     true,
						Editable:     true,
						ListShow:     true,
						Searchable:   true,
						Sort:         3,
					},
					{
						Key:          "username",
						Physical:     "username",
						Label:        "用户",
						BusinessType: "text",
						Required:     false,
						Editable:     false,
						ListShow:     true,
						Searchable:   true,
						Sort:         4,
					},
					{
						Key:          "message",
						Physical:     "message",
						Label:        "消息",
						BusinessType: "longtext",
						Required:     false,
						Editable:     true,
						ListShow:     false,
						Searchable:   true,
						Sort:         5,
					},
					{
						Key:          "path",
						Physical:     "path",
						Label:        "路径",
						BusinessType: "text",
						Required:     false,
						Editable:     true,
						ListShow:     false,
						Searchable:   true,
						Sort:         6,
					},
					{
						Key:          "ip",
						Physical:     "ip",
						Label:        "IP",
						BusinessType: "text",
						Required:     false,
						Editable:     true,
						ListShow:     false,
						Searchable:   true,
						Sort:         7,
					},
				},
			},
		},
		Relations: []logicmodels.RelationConfig{},
	}
}

// EnsureDefaultLogsModel 保证 auto_logs 逻辑模型存在。已有则跳过。
func EnsureDefaultLogsModel(lmStore *logicmodels.Store) error {
	if lmStore == nil {
		return fmt.Errorf("logicmodels.Store 为空")
	}
	cfg := defaultLogsModelConfig()
	if _, err := lmStore.Get(LogModelSlug); err == nil {
		return nil
	}
	if _, err := lmStore.Upsert(LogModelSlug, "日志", "系统日志条目,可通过 POST /api/logs 由外部系统写入", cfg); err != nil {
		return fmt.Errorf("保存默认日志模型失败: %w", err)
	}
	log.Printf("seed: 默认逻辑模型 %s 已写入", LogModelSlug)
	return nil
}

// EnsureDefaultLogsPage 在 pages 表中创建指向 auto_logs 的「日志」顶层页面。
// 已经存在则跳过 —— 用户可以在「页面」Tab 里自由改名/换图标/排序,seed 只负责
// 第一次启动时给出入口。
func EnsureDefaultLogsPage(pagesStore *pages.Store) error {
	if pagesStore == nil {
		return fmt.Errorf("pages.Store 为空")
	}
	rows, err := pagesStore.List()
	if err != nil {
		return fmt.Errorf("列出页面失败: %w", err)
	}
	for _, p := range rows {
		if p.Slug == LogPageSlug {
			return nil
		}
	}
	// sort 用 -1 让其默认排在底部导航首位(其他用户页面 sort 从 0 开始)。
	if _, err := pagesStore.Create(pages.Page{
		Slug:      LogPageSlug,
		Label:     "日志",
		Icon:      "ScrollText",
		ModelSlug: LogModelSlug,
		Sort:      -1,
	}); err != nil {
		return fmt.Errorf("创建默认日志页面失败: %w", err)
	}
	log.Printf("seed: 默认日志页面已写入")
	return nil
}

// EnsureAll 把 schema + 模型 + 页面三步串起来,适合 main.go 一处调用。
func EnsureAll(logStore *logentries.Store, lmStore *logicmodels.Store, pagesStore *pages.Store) error {
	if err := EnsureLogSchema(logStore); err != nil {
		return err
	}
	if err := EnsureDefaultLogsModel(lmStore); err != nil {
		return err
	}
	if err := EnsureDefaultLogsPage(pagesStore); err != nil {
		return err
	}
	return nil
}