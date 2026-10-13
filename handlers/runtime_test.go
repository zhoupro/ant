package handlers

import "testing"

func TestParseNowOffset(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantOK  bool
	}{
		{"now+30s", "+30 seconds", true},
		{"NOW+30s", "+30 seconds", true},
		{" now+30s ", "+30 seconds", true},
		{"now-30s", "-30 seconds", true},
		{"now+30", "+30 seconds", true},
		{"now-30", "-30 seconds", true},
		{"now+1m", "+1 minutes", true},
		{"now+1h", "+1 hours", true},
		{"now+1d", "+1 days", true},
		{"now+0s", "+0 seconds", true},
		// 不能解析的情况 —— 调用方应回退到 LIKE
		{"now", "", false},
		{"now+", "", false},
		{"now-", "", false},
		{"now+x", "", false},
		{"now+30x", "", false},
		{"2026-10-13T20:00", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, ok := parseNowOffset(c.in)
		if ok != c.wantOK || got != c.want {
			t.Errorf("parseNowOffset(%q) = (%q, %v), want (%q, %v)", c.in, got, ok, c.want, c.wantOK)
		}
	}
}

func TestSplitCSV(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"col1", []string{"col1"}},
		{"col1,col2", []string{"col1", "col2"}},
		{" col1 , col2 ,", []string{"col1", "col2"}},
		{",,,", nil},
	}
	for _, c := range cases {
		got := splitCSV(c.in)
		if len(got) != len(c.want) {
			t.Errorf("splitCSV(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitCSV(%q) = %v, want %v", c.in, got, c.want)
				break
			}
		}
	}
}