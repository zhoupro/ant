package dashboards

import (
	"errors"
	"fmt"
	"strings"
)

// forbiddenKeywords 出现在 SQL 中的任意位置即视为危险查询(忽略大小写)。
// 任何对 schema / 数据的写操作都不允许在统计卡片里执行。
// 注意匹配时按词边界裁剪,避免误伤如 "updated_at" 这类合法列名。
var forbiddenKeywords = []string{
	"insert", "update", "delete", "drop", "alter", "create", "replace",
	"truncate", "attach", "detach", "vacuum", "reindex", "grant", "revoke",
	"copy", "load_extension", "pragma",
}

// SanitizeSQL 做最基础的只读校验:
//   - 必须以 SELECT 或 WITH 开头(WITH ... SELECT 也算 CTE 形式的查询);
//   - 不允许出现分号(避免多语句注入);
//   - 不允许注释符(同源目的,不让用户把校验塞进 /* */ 里绕过);
//   - 不允许 dangerous keywords。
// 它不能替代真正的 SQL parser;真正的危险来自拼接、UNION 注入等;
// 但作为「防止误操作」这一层已经够用 —— 卡片 SQL 是受信任管理员手写的。
func SanitizeSQL(sql string) (string, error) {
	trimmed := strings.TrimSpace(sql)
	if trimmed == "" {
		return "", errors.New("SQL 不能为空")
	}
	// SQLite 的语法里 CTE 必须以 WITH 开头,以 SELECT ... 结尾。
	// 这里只校验前缀。
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
		return "", errors.New("统计卡片仅支持 SELECT / WITH 开头的只读查询")
	}
	if strings.Contains(trimmed, ";") {
		return "", errors.New("不支持多语句,SQL 里不能包含分号")
	}
	if strings.Contains(trimmed, "--") || strings.Contains(trimmed, "/*") {
		return "", errors.New("SQL 里不允许出现注释")
	}

	// 用一个简化的 lexer 把 identifier / 数字 / 字符串常量抠出来,
	// 只在剩余的「裸 SQL」里检查危险关键字,避免把列名 updated_at 误判为 update。
	tokens, err := tokenizeSQL(trimmed)
	if err != nil {
		return "", err
	}
	for _, tok := range tokens {
		upperTok := strings.ToUpper(tok)
		for _, bad := range forbiddenKeywords {
			if upperTok == bad {
				return "", fmt.Errorf("不允许的关键字 %s", bad)
			}
		}
	}

	return trimmed, nil
}

// tokenizeSQL 把 SQL 切成裸词,跳过字符串常量与标识符引用。
// 输出与原始大小写一致,但调用方通常 ToUpper 再比较。
func tokenizeSQL(sql string) ([]string, error) {
	var out []string
	var b strings.Builder
	inString := byte(0) // ' " `
	for i := 0; i < len(sql); i++ {
		c := sql[i]
		if inString != 0 {
			b.WriteByte(c)
			if c == inString {
				// SQLite 里 '' 是单引号里的转义;其它引号不做转义处理。
				if inString == '\'' && i+1 < len(sql) && sql[i+1] == '\'' {
					b.WriteByte('\'')
					i++
					continue
				}
				out = append(out, b.String())
				b.Reset()
				inString = 0
			}
			continue
		}
		switch c {
		case '\'', '"', '`':
			if b.Len() > 0 {
				out = append(out, b.String())
				b.Reset()
			}
			inString = c
			b.WriteByte(c)
		case '[', '(':
			// 方括号 / 圆括号是 SQLite 方言标识符或表达式边界,
			// 直接吞掉,不输出独立 token。
			b.WriteByte(c)
		default:
			if isIdentByte(c) {
				b.WriteByte(c)
			} else {
				if b.Len() > 0 {
					out = append(out, b.String())
					b.Reset()
				}
			}
		}
	}
	if inString != 0 {
		return nil, errors.New("SQL 字符串常量未闭合")
	}
	if b.Len() > 0 {
		out = append(out, b.String())
	}
	return out, nil
}

func isIdentByte(c byte) bool {
	return (c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= '0' && c <= '9') ||
		c == '_' || c == '.'
}