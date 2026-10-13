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

func TestParseNowRange(t *testing.T) {
	cases := []struct {
		in             string
		wantLower      string
		wantUpper      string
		wantOK         bool
	}{
		// 区间形式:左开右闭 (col > lower AND col <= upper)
		{"now+30s~now+1m", "+30 seconds", "+1 minutes", true},
		{"now+1m~now+5m", "+1 minutes", "+5 minutes", true},
		{"now+1h~now+1d", "+1 hours", "+1 days", true},
		{"now+5~now+15", "+5 seconds", "+15 seconds", true},
		// 半开区间:右侧空 = 开放上限 (col > lower)
		{"now+1d~", "+1 days", "", true},
		{"now+30s~", "+30 seconds", "", true},
		// 无法解析的情况
		{"now+30s", "", "", false},        // 单值走 parseNowOffset
		{"~now+1m", "", "", false},        // 必须有左侧
		{"now+30s~bad", "", "", false},     // 右侧无效
		{"now+30x~now+1m", "", "", false},  // 左侧单位无效
		{"", "", "", false},
	}
	for _, c := range cases {
		lo, up, ok := parseNowRange(c.in)
		if ok != c.wantOK || lo != c.wantLower || up != c.wantUpper {
			t.Errorf("parseNowRange(%q) = (%q, %q, %v), want (%q, %q, %v)",
				c.in, lo, up, ok, c.wantLower, c.wantUpper, c.wantOK)
		}
	}
}