export type CardKind = "number" | "line_chart";

export interface Dashboard {
  id: string;
  slug: string;
  label: string;
  icon: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardInput {
  slug: string;
  label: string;
  icon: string;
  sort: number;
}

export interface DashboardCard {
  id: string;
  dashboard_id: string;
  title: string;
  kind: CardKind;
  sql: string;
  config: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardCardInput {
  dashboard_id?: string;
  title: string;
  kind: CardKind;
  sql: string;
  config: string;
  sort: number;
}

export interface DashboardDetail {
  dashboard: Dashboard;
  cards: DashboardCard[];
}

export interface CardConfig {
  unit?: string;
  decimals?: number;
  x_column?: string;
  y_columns?: string[];
  columns?: Record<string, string>;
}

export interface CardRunResponse {
  card_id: string;
  kind: CardKind;
  config: CardConfig;
  columns: string[];
  rows: Record<string, unknown>[];
  limit: number;
}

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  number: "数字 / 表格",
  line_chart: "折线图",
};