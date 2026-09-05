package handlers

import (
	"errors"
	"fmt"
	"mc/datadb"
	"net/http"
	"reflect"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TablesHandler struct {
	mgr *datadb.Manager
}

func NewTablesHandler(mgr *datadb.Manager) *TablesHandler {
	return &TablesHandler{mgr: mgr}
}

var (
	identifierRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	pkSep        = "__"
)

type Column struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	NotNull    bool   `json:"notnull"`
	PrimaryKey bool   `json:"pk"`
	Default    string `json:"default,omitempty"`
}

func validateIdent(name string) error {
	if !identifierRe.MatchString(name) {
		return fmt.Errorf("非法标识符: %q", name)
	}
	return nil
}

func quoteIdent(name string) (string, error) {
	if err := validateIdent(name); err != nil {
		return "", err
	}
	return `"` + name + `"`, nil
}

func (h *TablesHandler) db(c *gin.Context) (*gorm.DB, bool) {
	gdb, err := h.mgr.Current()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}
	return gdb, true
}

func (h *TablesHandler) list(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	type row struct{ Name string }
	var rows []row
	if err := gdb.Raw(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		names = append(names, r.Name)
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"tables": names}})
}

func (h *TablesHandler) schema(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cols, pks, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"name": table, "columns": cols, "primary_keys": pks}})
}

func readSchema(gdb *gorm.DB, table string) ([]Column, []string, error) {
	type pragmaRow struct {
		CID       int    `gorm:"column:cid"`
		Name      string `gorm:"column:name"`
		Type      string `gorm:"column:type"`
		NotNull   int    `gorm:"column:notnull"`
		DfltValue any    `gorm:"column:dflt_value"`
		PK        int    `gorm:"column:pk"`
	}
	var rows []pragmaRow
	q := fmt.Sprintf("PRAGMA table_info(%q)", table)
	if err := gdb.Raw(q).Scan(&rows).Error; err != nil {
		return nil, nil, err
	}
	if len(rows) == 0 {
		return nil, nil, fmt.Errorf("表不存在或无字段: %s", table)
	}
	cols := make([]Column, 0, len(rows))
	var pks []string
	for _, r := range rows {
		cols = append(cols, Column{
			Name:       r.Name,
			Type:       r.Type,
			NotNull:    r.NotNull == 1,
			PrimaryKey: r.PK > 0,
			Default:    stringifyDefault(r.DfltValue),
		})
		if r.PK > 0 {
			pks = append(pks, r.Name)
		}
	}
	return cols, pks, nil
}

func stringifyDefault(v any) string {
	if v == nil {
		return ""
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Interface, reflect.Ptr, reflect.Slice, reflect.Map, reflect.Chan, reflect.Func:
		if rv.IsNil() {
			return ""
		}
		if rv.Kind() == reflect.Ptr || rv.Kind() == reflect.Interface {
			return stringifyDefault(rv.Elem().Interface())
		}
	}
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		s := string(x)
		if strings.HasPrefix(s, "0x") && len(s) > 12 {
			return ""
		}
		return s
	default:
		return ""
	}
}

func (h *TablesHandler) rows(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	limit := atoiDefault(c.Query("limit"), 50, 1, 500)
	offset := atoiDefault(c.Query("offset"), 0, 0, 1<<31-1)
	search := strings.TrimSpace(c.Query("search"))

	cols, _, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	colNames := make([]string, 0, len(cols))
	for _, c := range cols {
		colNames = append(colNames, c.Name)
	}

	quoted, _ := quoteIdent(table)
	where := ""
	args := []any{}
	if search != "" {
		parts := make([]string, 0, len(cols))
		for _, c := range cols {
			q, _ := quoteIdent(c.Name)
			parts = append(parts, fmt.Sprintf("CAST(%s AS TEXT) LIKE ?", q))
			args = append(args, "%"+search+"%")
		}
		where = "WHERE " + strings.Join(parts, " OR ")
	}

	var total int64
	countQ := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", quoted, where)
	if err := gdb.Raw(countQ, args...).Scan(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	selectCols := make([]string, 0, len(cols))
	for _, c := range cols {
		q, _ := quoteIdent(c.Name)
		selectCols = append(selectCols, q)
	}
	dataQ := fmt.Sprintf("SELECT %s FROM %s %s LIMIT ? OFFSET ?",
		strings.Join(selectCols, ", "), quoted, where)
	args = append(args, limit, offset)

	var dataRows []map[string]any
	dataRows = make([]map[string]any, 0)
	if err := gdb.Raw(dataQ, args...).Scan(&dataRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"columns":  cols,
		"rows":     dataRows,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
		"search":   search,
	}})
}

func (h *TablesHandler) getRow(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pk := c.Param("pk")
	cols, pks, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(pks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "表无主键，无法按主键查询"})
		return
	}
	where, args := buildPkWhere(pks, pk)
	quoted, _ := quoteIdent(table)
	q := fmt.Sprintf("SELECT * FROM %s WHERE %s LIMIT 1", quoted, where)
	var rows []map[string]any
	if err := gdb.Raw(q, args...).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(rows) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"columns": cols, "row": rows[0], "primary_keys": pks}})
}

type rowInput struct {
	Values map[string]any `json:"values"`
}

func (h *TablesHandler) insert(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var in rowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cols, _, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	colSet := make(map[string]bool, len(cols))
	for _, c := range cols {
		colSet[c.Name] = true
	}
	filtered := map[string]any{}
	for k, v := range in.Values {
		if !colSet[k] {
			continue
		}
		filtered[k] = v
	}
	quoted, _ := quoteIdent(table)
	names := make([]string, 0, len(filtered))
	placeholders := make([]string, 0, len(filtered))
	args := make([]any, 0, len(filtered))
	for _, c := range cols {
		if v, ok := filtered[c.Name]; ok {
			q, _ := quoteIdent(c.Name)
			names = append(names, q)
			placeholders = append(placeholders, "?")
			args = append(args, v)
		}
	}
	if len(names) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可插入的字段"})
		return
	}
	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoted, strings.Join(names, ", "), strings.Join(placeholders, ", "))
	if err := gdb.Exec(q, args...).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pk, _, _ := lastInsertInfo(gdb)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "last_insert_rowid": pk}})
}

func (h *TablesHandler) update(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pkVal := c.Param("pk")
	var in rowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cols, pks, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(pks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "表无主键，无法更新"})
		return
	}
	colSet := make(map[string]bool, len(cols))
	pkSet := make(map[string]bool, len(pks))
	for _, c := range cols {
		colSet[c.Name] = true
	}
	for _, p := range pks {
		pkSet[p] = true
	}
	sets := make([]string, 0, len(in.Values))
	args := make([]any, 0, len(in.Values)+len(pks))
	for k, v := range in.Values {
		if !colSet[k] || pkSet[k] {
			continue
		}
		q, _ := quoteIdent(k)
		sets = append(sets, q+" = ?")
		args = append(args, v)
	}
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可更新的字段"})
		return
	}
	where, wargs := buildPkWhere(pks, pkVal)
	args = append(args, wargs...)
	quoted, _ := quoteIdent(table)
	q := fmt.Sprintf("UPDATE %s SET %s WHERE %s", quoted, strings.Join(sets, ", "), where)
	res := gdb.Exec(q, args...)
	if res.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "rows_affected": res.RowsAffected}})
}

func (h *TablesHandler) delete(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pkVal := c.Param("pk")
	_, pks, err := readSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(pks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "表无主键，无法删除"})
		return
	}
	where, args := buildPkWhere(pks, pkVal)
	quoted, _ := quoteIdent(table)
	q := fmt.Sprintf("DELETE FROM %s WHERE %s", quoted, where)
	res := gdb.Exec(q, args...)
	if res.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "rows_affected": res.RowsAffected}})
}

type createTableInput struct {
	Name    string `json:"name"`
	Columns []struct {
		Name       string `json:"name"`
		Type       string `json:"type"`
		NotNull    bool   `json:"notnull"`
		PrimaryKey bool   `json:"pk"`
		Default    string `json:"default"`
	} `json:"columns"`
}

func (h *TablesHandler) create(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	var in createTableInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateIdent(in.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(in.Columns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请至少添加一个字段"})
		return
	}
	parts := make([]string, 0, len(in.Columns))
	pkCols := []string{}
	seen := map[string]bool{}
	for _, col := range in.Columns {
		if err := validateIdent(col.Name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if seen[col.Name] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "字段名重复: " + col.Name})
			return
		}
		seen[col.Name] = true
		colType := normalizeType(col.Type)
		if colType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "字段类型无效: " + col.Name})
			return
		}
		q, _ := quoteIdent(col.Name)
		def := strings.TrimSpace(col.Default)
		notNull := ""
		if col.NotNull {
			notNull = " NOT NULL"
		}
		defaultClause := ""
		if def != "" {
			defaultClause = " DEFAULT " + def
		}
		pkClause := ""
		if col.PrimaryKey {
			pkCols = append(pkCols, col.Name)
			pkClause = " PRIMARY KEY"
		}
		parts = append(parts, fmt.Sprintf("%s %s%s%s%s", q, colType, pkClause, notNull, defaultClause))
	}
	if len(pkCols) > 1 {
		for i, p := range pkCols {
			q, _ := quoteIdent(p)
			pkCols[i] = q
		}
		parts = append(parts, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(pkCols, ", ")))
	}
	quoted, _ := quoteIdent(in.Name)
	stmt := fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", quoted, strings.Join(parts, ",\n  "))
	if err := gdb.Exec(stmt).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"name": in.Name, "sql": stmt}})
}

func (h *TablesHandler) drop(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	quoted, _ := quoteIdent(table)
	stmt := fmt.Sprintf("DROP TABLE %s", quoted)
	if err := gdb.Exec(stmt).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "name": table}})
}

type addColumnInput struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	NotNull bool   `json:"notnull"`
	Default string `json:"default"`
}

func (h *TablesHandler) addColumn(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var in addColumnInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateIdent(in.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	colType := normalizeType(in.Type)
	if colType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "字段类型无效"})
		return
	}
	q, _ := quoteIdent(in.Name)
	quoted, _ := quoteIdent(table)
	parts := []string{q, colType}
	if in.NotNull {
		parts = append(parts, "NOT NULL")
	}
	if strings.TrimSpace(in.Default) != "" {
		parts = append(parts, "DEFAULT "+strings.TrimSpace(in.Default))
	}
	stmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", quoted, strings.Join(parts, " "))
	if err := gdb.Exec(stmt).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "sql": stmt}})
}

func (h *TablesHandler) dropColumn(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	column := c.Param("column")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateIdent(column); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pt, err := readPhysicalSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	usedInFK := false
	for _, fk := range pt.ForeignKeys {
		if fk.From == column {
			usedInFK = true
			break
		}
	}
	if usedInFK {
		c.JSON(http.StatusBadRequest, gin.H{"error": "字段被外键引用,无法删除"})
		return
	}
	col, _ := quoteIdent(column)
	quoted, _ := quoteIdent(table)
	stmt := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", quoted, col)
	if err := gdb.Exec(stmt).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "sql": stmt}})
}

func normalizeType(t string) string {
	t = strings.TrimSpace(strings.ToUpper(t))
	switch t {
	case "TEXT", "INTEGER", "INT", "REAL", "BLOB", "NUMERIC", "BOOLEAN", "BOOL", "DATE", "DATETIME", "TIMESTAMP":
		if t == "INT" {
			return "INTEGER"
		}
		if t == "BOOL" {
			return "BOOLEAN"
		}
		return t
	}
	if strings.HasPrefix(t, "VARCHAR") || strings.HasPrefix(t, "NVARCHAR") {
		return "TEXT"
	}
	if strings.HasPrefix(t, "DECIMAL") || strings.HasPrefix(t, "NUMERIC") {
		return "NUMERIC"
	}
	return ""
}

func atoiDefault(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func buildPkWhere(pks []string, composite string) (string, []any) {
	if len(pks) == 1 {
		q, _ := quoteIdent(pks[0])
		return fmt.Sprintf("%s = ?", q), []any{composite}
	}
	parts := strings.SplitN(composite, pkSep, len(pks))
	if len(parts) != len(pks) {
		return buildFallbackWhere(pks, composite)
	}
	clauses := make([]string, 0, len(pks))
	args := make([]any, 0, len(pks))
	for i, p := range pks {
		q, _ := quoteIdent(p)
		clauses = append(clauses, fmt.Sprintf("%s = ?", q))
		args = append(args, parts[i])
	}
	return strings.Join(clauses, " AND "), args
}

func buildFallbackWhere(pks []string, composite string) (string, []any) {
	q, _ := quoteIdent(pks[0])
	return fmt.Sprintf("%s = ?", q), []any{composite}
}

func lastInsertInfo(gdb *gorm.DB) (int64, []string, error) {
	type row struct {
		ID int64
	}
	var r row
	err := gdb.Raw("SELECT last_insert_rowid() AS id").Scan(&r).Error
	return r.ID, nil, err
}

var _ = errors.New