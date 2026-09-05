package handlers

import (
	"fmt"
	"mc/datadb"
	"strings"

	"gorm.io/gorm"
)

type physicalColumn struct {
	Name       string
	Type       string
	NotNull    bool
	PrimaryKey bool
	Default    string
}

type physicalTable struct {
	Name        string
	Columns     []physicalColumn
	PrimaryKeys []string
	ForeignKeys []datadb.ForeignKey
}

func readPhysicalSchema(gdb *gorm.DB, table string) (physicalTable, error) {
	var out physicalTable
	out.Name = table
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
		return out, err
	}
	if len(rows) == 0 {
		return out, fmt.Errorf("表不存在或无字段: %s", table)
	}
	for _, r := range rows {
		out.Columns = append(out.Columns, physicalColumn{
			Name:       r.Name,
			Type:       r.Type,
			NotNull:    r.NotNull == 1,
			PrimaryKey: r.PK > 0,
			Default:    stringifyDefault(r.DfltValue),
		})
		if r.PK > 0 {
			out.PrimaryKeys = append(out.PrimaryKeys, r.Name)
		}
	}
	fks, err := datadb.ListForeignKeys(gdb, table)
	if err == nil {
		out.ForeignKeys = fks
	}
	return out, nil
}

func inferBusinessType(colType string) string {
	t := strings.ToUpper(strings.TrimSpace(colType))
	switch {
	case strings.Contains(t, "INT"):
		return "integer"
	case strings.Contains(t, "REAL"), strings.Contains(t, "FLOAT"), strings.Contains(t, "DOUB"), strings.Contains(t, "DECIMAL"), strings.Contains(t, "NUMERIC"):
		return "number"
	case strings.Contains(t, "BOOL"):
		return "boolean"
	case strings.Contains(t, "DATE"), strings.Contains(t, "TIME"):
		return "text"
	case strings.Contains(t, "JSON"):
		return "json"
	case strings.Contains(t, "BLOB"):
		return "file"
	}
	return "text"
}