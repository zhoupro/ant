package dashboards

import "testing"

func TestSanitizeSQL(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want string
		bad  bool
	}{
		{"select", "SELECT * FROM users", "SELECT * FROM users", false},
		{"with-cte", "WITH t AS (SELECT 1) SELECT * FROM t", "WITH t AS (SELECT 1) SELECT * FROM t", false},
		{"empty", "", "", true},
		{"semicolon", "SELECT 1; DROP TABLE users", "", true},
		{"insert", "INSERT INTO users VALUES (1)", "", true},
		{"update", "UPDATE users SET x = 1", "", true},
		{"delete", "DELETE FROM users", "", true},
		{"drop", "DROP TABLE users", "", true},
		{"alter", "ALTER TABLE users ADD COLUMN x INT", "", true},
		{"pragma", "PRAGMA writable_schema = 1", "", true},
		{"comment-line", "SELECT 1 -- inline comment", "", true},
		{"comment-block", "SELECT /* evil */ 1", "", true},
		{"column-with-update-name", "SELECT created_at, updated_at FROM users", "SELECT created_at, updated_at FROM users", false},
		{"union-select", "SELECT 1 UNION SELECT 2", "SELECT 1 UNION SELECT 2", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := SanitizeSQL(c.sql)
			if c.bad {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}