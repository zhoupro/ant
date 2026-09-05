package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"mc/datadb"
	"mc/logicmodels"
	"mc/models"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

type RuntimeHandler struct {
	store *logicmodels.Store
	mgr   *datadb.Manager
}

func NewRuntimeHandler(store *logicmodels.Store, mgr *datadb.Manager) *RuntimeHandler {
	return &RuntimeHandler{store: store, mgr: mgr}
}

type runtimeField struct {
	Key          string                   `json:"key"`
	Physical     string                   `json:"physical"`
	Label        string                   `json:"label"`
	BusinessType string                   `json:"business_type"`
	Required     bool                     `json:"required"`
	Editable     bool                     `json:"editable"`
	ListShow     bool                     `json:"list_show"`
	Searchable   bool                     `json:"searchable"`
	Sort         int                      `json:"sort"`
	Placeholder  string                   `json:"placeholder,omitempty"`
	Options      []logicmodels.SelectOption `json:"options,omitempty"`
}

type runtimeTable struct {
	Alias      string         `json:"alias"`
	Physical   string         `json:"physical"`
	Label      string         `json:"label"`
	PrimaryKey string         `json:"primary_key"`
	Fields     []runtimeField `json:"fields"`
}

type runtimeRelation struct {
	ID             string                  `json:"id"`
	Type           logicmodels.RelationType `json:"type"`
	FromAlias      string                  `json:"from_alias"`
	FromColumn     string                  `json:"from_column"`
	ToAlias        string                  `json:"to_alias"`
	ToColumn       string                  `json:"to_column"`
	JoinTable      string                  `json:"join_table,omitempty"`
	JoinFromColumn string                  `json:"join_from_column,omitempty"`
	JoinToColumn   string                  `json:"join_to_column,omitempty"`
	Label          string                  `json:"label,omitempty"`
}

type runtimeSchema struct {
	Slug          string            `json:"slug"`
	Label         string            `json:"label"`
	Description   string            `json:"description"`
	RootAlias     string            `json:"root_alias"`
	Tables        []runtimeTable    `json:"tables"`
	Relations     []runtimeRelation `json:"relations"`
	BusinessTypes []gin.H           `json:"business_types"`
	UpdatedAt     string            `json:"updated_at"`
}

func (h *RuntimeHandler) db(c *gin.Context) (*gorm.DB, *models.LogicModel, logicmodels.ModelConfig, bool) {
	slug := c.Param("slug")
	row, err := h.store.Get(slug)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "逻辑模型不存在"})
			return nil, nil, logicmodels.ModelConfig{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return nil, nil, logicmodels.ModelConfig{}, false
	}
	gdb, err := h.mgr.Current()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, nil, logicmodels.ModelConfig{}, false
	}
	cfg, err := logicmodels.Decode(row)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, nil, logicmodels.ModelConfig{}, false
	}
	return gdb, row, cfg, true
}

func (h *RuntimeHandler) resolveTables(gdb *gorm.DB, cfg logicmodels.ModelConfig) (map[string]*physicalTable, error) {
	tables := make(map[string]*physicalTable)
	for _, t := range cfg.Tables {
		if err := validateIdent(t.Physical); err != nil {
			return nil, fmt.Errorf("表 %s: %w", t.Alias, err)
		}
		pt, err := readPhysicalSchema(gdb, t.Physical)
		if err != nil {
			return nil, fmt.Errorf("表 %s (%s) 不存在或无字段", t.Alias, t.Physical)
		}
		tables[t.Alias] = &pt
	}
	return tables, nil
}

func (h *RuntimeHandler) schema(c *gin.Context) {
	_, row, cfg, ok := h.db(c)
	if !ok {
		return
	}
	gdb, err := h.mgr.Current()
	if !ok || err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据库未加载"})
		return
	}
	_, err = h.resolveTables(gdb, cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	out := runtimeSchema{
		Slug:        row.Slug,
		Label:       row.Label,
		Description: row.Description,
		RootAlias:   cfg.RootAlias,
		UpdatedAt:   row.UpdatedAt.Format("2006-01-02 15:04:05"),
	}
	for _, t := range cfg.Tables {
		rt := runtimeTable{
			Alias:      t.Alias,
			Physical:   t.Physical,
			Label:      t.Label,
			PrimaryKey: t.PrimaryKey,
		}
		for _, f := range t.Fields {
			rt.Fields = append(rt.Fields, runtimeField{
				Key:          f.Key,
				Physical:     f.Physical,
				Label:        f.Label,
				BusinessType: f.BusinessType,
				Required:     f.Required,
				Editable:     f.Editable,
				ListShow:     f.ListShow,
				Searchable:   f.Searchable,
				Sort:         f.Sort,
				Placeholder:  f.Placeholder,
				Options:      f.Options,
			})
		}
		sort.SliceStable(rt.Fields, func(i, j int) bool {
			if rt.Fields[i].Sort == rt.Fields[j].Sort {
				return rt.Fields[i].Key < rt.Fields[j].Key
			}
			return rt.Fields[i].Sort < rt.Fields[j].Sort
		})
		out.Tables = append(out.Tables, rt)
	}
	for _, r := range cfg.Relations {
		out.Relations = append(out.Relations, runtimeRelation{
			ID:             r.ID,
			Type:           r.Type,
			FromAlias:      r.FromAlias,
			FromColumn:     r.FromColumn,
			ToAlias:        r.ToAlias,
			ToColumn:       r.ToColumn,
			JoinTable:      r.JoinTable,
			JoinFromColumn: r.JoinFromColumn,
			JoinToColumn:   r.JoinToColumn,
			Label:          r.Label,
		})
	}
	if out.Relations == nil {
		out.Relations = []runtimeRelation{}
	}
	for _, bt := range logicmodels.BusinessTypes() {
		out.BusinessTypes = append(out.BusinessTypes, gin.H{
			"value": bt,
			"label": logicmodels.BusinessTypeLabel(bt),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *RuntimeHandler) findRoot(cfg logicmodels.ModelConfig) (*logicmodels.TableConfig, bool) {
	for i := range cfg.Tables {
		if cfg.Tables[i].Alias == cfg.RootAlias {
			return &cfg.Tables[i], true
		}
	}
	return nil, false
}

func (h *RuntimeHandler) rows(c *gin.Context) {
	gdb, row, cfg, ok := h.db(c)
	if !ok {
		return
	}
	root, ok := h.findRoot(cfg)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "根表配置缺失"})
		return
	}
	limit := atoiDefault(c.Query("limit"), 50, 1, 500)
	offset := atoiDefault(c.Query("offset"), 0, 0, 1<<31-1)
	search := strings.TrimSpace(c.Query("search"))

	pt, err := readPhysicalSchema(gdb, root.Physical)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	physicalColSet := map[string]bool{}
	for _, col := range pt.Columns {
		physicalColSet[col.Name] = true
	}
	pk := root.PrimaryKey
	if pk == "" {
		if len(pt.PrimaryKeys) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "根表无主键"})
			return
		}
		pk = pt.PrimaryKeys[0]
	}
	pkInSchema := false
	for _, col := range pt.Columns {
		if col.Name == pk {
			pkInSchema = true
			break
		}
	}
	if !pkInSchema {
		pkInSchema = true
	}

	quoted, _ := quoteIdent(root.Physical)
	selectCols := []string{}
	seen := map[string]bool{}
	if !seen[pk] {
		selectCols = append(selectCols, fmt.Sprintf("%s.%s", quoted, quoteCol(pk)))
		seen[pk] = true
	}
	fieldsOut := []gin.H{
		{
			"key":           "__pk",
			"physical":      pk,
			"label":         "ID",
			"business_type": "integer",
			"editable":      false,
			"required":      true,
			"list_show":     false,
			"searchable":    false,
			"sort":          -1,
		},
	}
	for _, f := range root.Fields {
		if !physicalColSet[f.Physical] {
			continue
		}
		if !seen[f.Physical] {
			selectCols = append(selectCols, fmt.Sprintf("%s.%s", quoted, quoteCol(f.Physical)))
			seen[f.Physical] = true
		}
		fieldsOut = append(fieldsOut, gin.H{
			"key":           f.Key,
			"physical":      f.Physical,
			"label":         f.Label,
			"business_type": f.BusinessType,
			"required":      f.Required,
			"editable":      f.Editable,
			"list_show":     f.ListShow,
			"searchable":    f.Searchable,
			"sort":          f.Sort,
			"placeholder":   f.Placeholder,
			"options":       f.Options,
		})
	}

	// belongs_to: relations where the FK lives on the root table.
	// We LEFT JOIN each related table and append its list_show fields as extra columns.
	joins := []string{}
	for _, rel := range cfg.Relations {
		if rel.Type != logicmodels.RelOneToOne && rel.Type != logicmodels.RelOneToMany {
			continue
		}
		if rel.FromAlias != cfg.RootAlias {
			continue
		}
		other, ok := h.findTable(cfg, rel.ToAlias)
		if !ok {
			continue
		}
		otherPT, err := readPhysicalSchema(gdb, other.Physical)
		if err != nil {
			continue
		}
		otherColSet := map[string]bool{}
		for _, c := range otherPT.Columns {
			otherColSet[c.Name] = true
		}
		// rel.FromColumn is the FK column on the root table;
		// rel.ToColumn is the PK column on the related table.
		if !physicalColSet[rel.FromColumn] || !otherColSet[rel.ToColumn] {
			continue
		}
		relLabel := rel.Label
		if relLabel == "" {
			relLabel = other.Label
		}
		joinAlias := "rel_" + sanitizeIdent(rel.ID)
		addedAny := false
		for _, f := range other.Fields {
			if !f.ListShow {
				continue
			}
			if !otherColSet[f.Physical] {
				continue
			}
			colKey := "__rel_" + rel.ID + "_" + f.Key
			joinQuotedAlias, _ := quoteIdent(joinAlias)
			selectCols = append(selectCols, fmt.Sprintf("%s.%s AS %s",
				joinQuotedAlias,
				quoteCol(f.Physical),
				quoteCol(colKey),
			))
			fieldsOut = append(fieldsOut, gin.H{
				"key":           colKey,
				"physical":      colKey,
				"label":         relLabel + " · " + f.Label,
				"business_type": f.BusinessType,
				"required":      false,
				"editable":      false,
				"list_show":     true,
				"searchable":    false,
				"sort":          1000 + f.Sort,
				"placeholder":   "",
				"options":       f.Options,
			})
			addedAny = true
		}
		if !addedAny {
			continue
		}
		otherQuoted, _ := quoteIdent(other.Physical)
		joinQuoted, _ := quoteIdent(joinAlias)
		rootQuoted, _ := quoteIdent(root.Physical)
		joins = append(joins, fmt.Sprintf("LEFT JOIN %s AS %s ON %s.%s = %s.%s",
			otherQuoted,
			joinQuoted,
			rootQuoted,
			quoteCol(rel.FromColumn),
			joinQuoted,
			quoteCol(rel.ToColumn),
		))
	}
	sort.SliceStable(fieldsOut[1:], func(i, j int) bool {
		ai, _ := fieldsOut[i+1]["sort"].(int)
		aj, _ := fieldsOut[j+1]["sort"].(int)
		if ai == aj {
			ki, _ := fieldsOut[i+1]["key"].(string)
			kj, _ := fieldsOut[j+1]["key"].(string)
			return ki < kj
		}
		return ai < aj
	})

	where := ""
	args := []any{}
	if search != "" {
		parts := []string{}
		for _, f := range root.Fields {
			if !f.Searchable {
				continue
			}
			if !physicalColSet[f.Physical] {
				continue
			}
			parts = append(parts, fmt.Sprintf("CAST(%s AS TEXT) LIKE ?", quoteCol(f.Physical)))
			args = append(args, "%"+search+"%")
		}
		if len(parts) > 0 {
			where = "WHERE " + strings.Join(parts, " OR ")
		}
	}

	var total int64
	countQ := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", quoted, where)
	if err := gdb.Raw(countQ, args...).Scan(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	joinsClause := ""
	if len(joins) > 0 {
		joinsClause = " " + strings.Join(joins, " ")
	}
	dataQ := fmt.Sprintf("SELECT %s FROM %s%s %s ORDER BY %s.%s DESC LIMIT ? OFFSET ?",
		strings.Join(selectCols, ", "), quoted, joinsClause, where, quoted, quoteCol(pk))
	args = append(args, limit, offset)
	dataRows := make([]map[string]any, 0)
	if err := gdb.Raw(dataQ, args...).Scan(&dataRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"slug":    row.Slug,
		"label":   row.Label,
		"fields":  fieldsOut,
		"rows":    dataRows,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
		"search":  search,
		"primary": pk,
	}})
}

func (h *RuntimeHandler) getRow(c *gin.Context) {
	gdb, _, cfg, ok := h.db(c)
	if !ok {
		return
	}
	root, ok := h.findRoot(cfg)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "根表配置缺失"})
		return
	}
	id := c.Param("pk")
	pt, err := readPhysicalSchema(gdb, root.Physical)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pk := root.PrimaryKey
	if pk == "" {
		if len(pt.PrimaryKeys) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "根表无主键"})
			return
		}
		pk = pt.PrimaryKeys[0]
	}
	quoted, _ := quoteIdent(root.Physical)
	q := fmt.Sprintf("SELECT * FROM %s WHERE %s = ? LIMIT 1", quoted, quoteCol(pk))
	rows := make([]map[string]any, 0)
	if err := gdb.Raw(q, id).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(rows) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	row := rows[0]
	row["__pk"] = row[pk]

	expanded, err := h.expandRelations(gdb, cfg, root.Alias, pk, row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"row":       row,
		"relations": expanded,
		"primary":   pk,
	}})
}

func (h *RuntimeHandler) expandRelations(gdb *gorm.DB, cfg logicmodels.ModelConfig, rootAlias string, rootPK string, row map[string]any) ([]gin.H, error) {
	out := []gin.H{}
	rootValue := row[rootPK]
	for _, r := range cfg.Relations {
		switch r.Type {
		case logicmodels.RelOneToOne, logicmodels.RelOneToMany:
			if r.FromAlias == rootAlias {
				otherAlias, otherColumn := r.ToAlias, r.ToColumn
				fkValue, ok := row[r.FromColumn]
				if !ok {
					continue
				}
				other, ok := h.findTable(cfg, otherAlias)
				if !ok {
					continue
				}
				qt, _ := quoteIdent(other.Physical)
				q := fmt.Sprintf("SELECT * FROM %s WHERE %s = ?", qt, quoteCol(otherColumn))
				rows := make([]map[string]any, 0)
				if err := gdb.Raw(q, fkValue).Scan(&rows).Error; err != nil {
					return nil, err
				}
				label := r.Label
				if label == "" {
					label = other.Label
				}
				out = append(out, gin.H{
					"id":     r.ID,
					"type":   r.Type,
					"label":  label,
					"target": otherAlias,
					"rows":   rows,
				})
			} else if r.ToAlias == rootAlias {
				otherAlias, otherColumn := r.FromAlias, r.FromColumn
				other, ok := h.findTable(cfg, otherAlias)
				if !ok {
					continue
				}
				qt, _ := quoteIdent(other.Physical)
				q := fmt.Sprintf("SELECT * FROM %s WHERE %s = ?", qt, quoteCol(otherColumn))
				rows := make([]map[string]any, 0)
				if err := gdb.Raw(q, rootValue).Scan(&rows).Error; err != nil {
					return nil, err
				}
				label := r.Label
				if label == "" {
					label = other.Label
				}
				out = append(out, gin.H{
					"id":     r.ID,
					"type":   r.Type,
					"label":  label,
					"target": otherAlias,
					"rows":   rows,
				})
			}
		case logicmodels.RelManyToMany:
			var otherAlias, otherColumn, joinFromCol, joinToCol string
			match := false
			if r.FromAlias == rootAlias {
				otherAlias = r.ToAlias
				otherColumn = r.ToColumn
				joinFromCol = r.JoinFromColumn
				joinToCol = r.JoinToColumn
				match = true
			} else if r.ToAlias == rootAlias {
				otherAlias = r.FromAlias
				otherColumn = r.FromColumn
				joinFromCol = r.JoinToColumn
				joinToCol = r.JoinFromColumn
				match = true
			}
			if !match {
				continue
			}
			other, ok := h.findTable(cfg, otherAlias)
			if !ok {
				continue
			}
			jq, _ := quoteIdent(r.JoinTable)
			tq, _ := quoteIdent(other.Physical)
			q := fmt.Sprintf(
				"SELECT t.* FROM %s j JOIN %s t ON j.%s = t.%s WHERE j.%s = ?",
				jq, tq, quoteCol(joinToCol), quoteCol(otherColumn), quoteCol(joinFromCol),
			)
			rows := make([]map[string]any, 0)
			if err := gdb.Raw(q, rootValue).Scan(&rows).Error; err != nil {
				return nil, err
			}
			label := r.Label
			if label == "" {
				label = other.Label
			}
			out = append(out, gin.H{
				"id":     r.ID,
				"type":   r.Type,
				"label":  label,
				"target": otherAlias,
				"join":   r.JoinTable,
				"rows":   rows,
			})
		}
	}
	return out, nil
}

func (h *RuntimeHandler) findTable(cfg logicmodels.ModelConfig, alias string) (*logicmodels.TableConfig, bool) {
	for i := range cfg.Tables {
		if cfg.Tables[i].Alias == alias {
			return &cfg.Tables[i], true
		}
	}
	return nil, false
}

type runtimeRowInput struct {
	Values    map[string]any   `json:"values"`
	Relations map[string][]any `json:"relations,omitempty"`
}

func (h *RuntimeHandler) insert(c *gin.Context) {
	gdb, _, cfg, ok := h.db(c)
	if !ok {
		return
	}
	root, ok := h.findRoot(cfg)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "根表配置缺失"})
		return
	}
	var in runtimeRowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pt, err := readPhysicalSchema(gdb, root.Physical)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	physicalColSet := map[string]bool{}
	for _, col := range pt.Columns {
		physicalColSet[col.Name] = true
	}
	fieldByKey := map[string]logicmodels.FieldConfig{}
	for _, f := range root.Fields {
		fieldByKey[f.Key] = f
	}
	columns := []string{}
	placeholders := []string{}
	args := []any{}
	for k, v := range in.Values {
		f, ok := fieldByKey[k]
		if !ok {
			continue
		}
		if !f.Editable {
			continue
		}
		if !physicalColSet[f.Physical] {
			continue
		}
		coerced, err := coerceValueForInsert(v, f)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("字段 %s: %s", f.Label, err.Error())})
			return
		}
		if coerced == nil && f.Required {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("字段 %s 必填", f.Label)})
			return
		}
		if coerced == nil {
			continue
		}
		columns = append(columns, quoteCol(f.Physical))
		placeholders = append(placeholders, "?")
		args = append(args, coerced)
	}
	if len(columns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可插入的字段"})
		return
	}
	quoted, _ := quoteIdent(root.Physical)
	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", quoted, strings.Join(columns, ", "), strings.Join(placeholders, ", "))
	if err := gdb.Exec(q, args...).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var idRow struct{ ID int64 }
	if err := gdb.Raw("SELECT last_insert_rowid() AS id").Scan(&idRow).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.applyRelations(gdb, cfg, root, idRow.ID, in.Relations, true); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": idRow.ID}})
}

func (h *RuntimeHandler) update(c *gin.Context) {
	gdb, _, cfg, ok := h.db(c)
	if !ok {
		return
	}
	root, ok := h.findRoot(cfg)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "根表配置缺失"})
		return
	}
	id := c.Param("pk")
	var in runtimeRowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pt, err := readPhysicalSchema(gdb, root.Physical)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pk := root.PrimaryKey
	if pk == "" {
		if len(pt.PrimaryKeys) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "根表无主键"})
			return
		}
		pk = pt.PrimaryKeys[0]
	}
	physicalColSet := map[string]bool{}
	for _, col := range pt.Columns {
		physicalColSet[col.Name] = true
	}
	fieldByKey := map[string]logicmodels.FieldConfig{}
	for _, f := range root.Fields {
		fieldByKey[f.Key] = f
	}
	sets := []string{}
	args := []any{}
	for k, v := range in.Values {
		f, ok := fieldByKey[k]
		if !ok {
			continue
		}
		if !f.Editable {
			continue
		}
		if !physicalColSet[f.Physical] {
			continue
		}
		coerced, err := coerceValueForUpdate(v, f)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("字段 %s: %s", f.Label, err.Error())})
			return
		}
		if coerced == nil {
			continue
		}
		sets = append(sets, fmt.Sprintf("%s = ?", quoteCol(f.Physical)))
		args = append(args, coerced)
	}
	if len(sets) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "rows_affected": 0, "note": "无可更新字段"}})
		return
	}
	quoted, _ := quoteIdent(root.Physical)
	args = append(args, id)
	q := fmt.Sprintf("UPDATE %s SET %s WHERE %s = ?", quoted, strings.Join(sets, ", "), quoteCol(pk))
	res := gdb.Exec(q, args...)
	if res.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Error.Error()})
		return
	}
	idVal, _ := strconv.ParseInt(id, 10, 64)
	if err := h.applyRelations(gdb, cfg, root, idVal, in.Relations, false); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "rows_affected": res.RowsAffected}})
}

func (h *RuntimeHandler) applyRelations(gdb *gorm.DB, cfg logicmodels.ModelConfig, root *logicmodels.TableConfig, rootID int64, relations map[string][]any, isInsert bool) error {
	if len(relations) == 0 {
		return nil
	}
	for _, r := range cfg.Relations {
		if r.Type != logicmodels.RelManyToMany {
			continue
		}
		if r.FromAlias != root.Alias {
			continue
		}
		ids, ok := relations[r.ID]
		if !ok {
			continue
		}
		if !isInsert {
			jq, _ := quoteIdent(r.JoinTable)
			if err := gdb.Exec(fmt.Sprintf("DELETE FROM %s WHERE %s = ?", jq, quoteCol(r.JoinFromColumn)), rootID).Error; err != nil {
				return fmt.Errorf("清理关联 %s 失败: %w", r.Label, err)
			}
		}
		jq, _ := quoteIdent(r.JoinTable)
		for _, idVal := range ids {
			if err := gdb.Exec(fmt.Sprintf("INSERT INTO %s (%s, %s) VALUES (?, ?)", jq, quoteCol(r.JoinFromColumn), quoteCol(r.JoinToColumn)), rootID, idVal).Error; err != nil {
				return fmt.Errorf("写入关联 %s 失败: %w", r.Label, err)
			}
		}
	}
	return nil
}

func (h *RuntimeHandler) delete(c *gin.Context) {
	gdb, _, cfg, ok := h.db(c)
	if !ok {
		return
	}
	root, ok := h.findRoot(cfg)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "根表配置缺失"})
		return
	}
	id := c.Param("pk")
	pt, err := readPhysicalSchema(gdb, root.Physical)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pk := root.PrimaryKey
	if pk == "" {
		if len(pt.PrimaryKeys) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "根表无主键"})
			return
		}
		pk = pt.PrimaryKeys[0]
	}
	quoted, _ := quoteIdent(root.Physical)
	q := fmt.Sprintf("DELETE FROM %s WHERE %s = ?", quoted, quoteCol(pk))
	res := gdb.Exec(q, id)
	if res.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Error.Error()})
		return
	}
	for _, r := range cfg.Relations {
		if r.FromAlias != root.Alias {
			continue
		}
		if r.Type == logicmodels.RelManyToMany && r.JoinTable != "" {
			jq, _ := quoteIdent(r.JoinTable)
			_ = gdb.Exec(fmt.Sprintf("DELETE FROM %s WHERE %s = ?", jq, quoteCol(r.JoinFromColumn)), id).Error
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "rows_affected": res.RowsAffected}})
}

func quoteCol(name string) string {
	if name == "" {
		return `""`
	}
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func sanitizeIdent(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	out := b.String()
	if out == "" || !(out[0] >= 'A' && out[0] <= 'Z') && !(out[0] >= 'a' && out[0] <= 'z') && out[0] != '_' {
		out = "r_" + out
	}
	return out
}

func coerceValueForInsert(v any, f logicmodels.FieldConfig) (any, error) {
	if v == nil {
		return nil, nil
	}
	return coerceValue(v, f)
}

func coerceValueForUpdate(v any, f logicmodels.FieldConfig) (any, error) {
	switch x := v.(type) {
	case string:
		if x == "" {
			return nil, nil
		}
	}
	return coerceValue(v, f)
}

func coerceValue(v any, f logicmodels.FieldConfig) (any, error) {
	switch f.BusinessType {
	case "json":
		switch x := v.(type) {
		case string:
			if strings.TrimSpace(x) == "" {
				return nil, nil
			}
			return x, nil
		default:
			b, err := jsonMarshal(v)
			if err != nil {
				return nil, err
			}
			return string(b), nil
		}
	case "boolean":
		if b, ok := v.(bool); ok {
			if b {
				return 1, nil
			}
			return 0, nil
		}
		if s, ok := v.(string); ok {
			switch strings.ToLower(s) {
			case "true", "1", "on":
				return 1, nil
			case "false", "0", "off", "":
				return 0, nil
			}
		}
		if n, ok := v.(float64); ok {
			if n != 0 {
				return 1, nil
			}
			return 0, nil
		}
		return v, nil
	case "integer", "number":
		switch x := v.(type) {
		case float64:
			return x, nil
		case string:
			s := strings.TrimSpace(x)
			if s == "" {
				return nil, nil
			}
			n, err := strconv.ParseFloat(s, 64)
			if err != nil {
				return nil, fmt.Errorf("需要数字")
			}
			return n, nil
		}
		return v, nil
	case "images", "multiselect":
		switch x := v.(type) {
		case string:
			s := strings.TrimSpace(x)
			if s == "" {
				return nil, nil
			}
			return s, nil
		default:
			b, err := jsonMarshal(v)
			if err != nil {
				return nil, err
			}
			return string(b), nil
		}
	case "date":
		if s, ok := v.(string); ok && strings.TrimSpace(s) == "" {
			return nil, nil
		}
		return v, nil
	}
	return v, nil
}