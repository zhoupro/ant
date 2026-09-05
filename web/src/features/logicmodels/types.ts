export type RelationType = "one_to_one" | "one_to_many" | "many_to_many";

export type BusinessType =
  | "text"
  | "longtext"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "image"
  | "images"
  | "file"
  | "json"
  | "richtext"
  | "select"
  | "multiselect"
  | "url"
  | "email"
  | "phone"
  | "color";

export interface SelectOption {
  label: string;
  value: string;
}

export interface FieldConfig {
  key: string;
  physical: string;
  label: string;
  business_type: BusinessType;
  required: boolean;
  editable: boolean;
  list_show: boolean;
  searchable: boolean;
  sort: number;
  placeholder?: string;
  options?: SelectOption[];
}

export interface TableConfig {
  alias: string;
  physical: string;
  label: string;
  primary_key: string;
  fields: FieldConfig[];
}

export interface RelationConfig {
  id: string;
  type: RelationType;
  from_alias: string;
  from_column: string;
  to_alias: string;
  to_column: string;
  join_table?: string;
  join_from_column?: string;
  join_to_column?: string;
  label?: string;
}

export interface ModelConfig {
  root_alias: string;
  tables: TableConfig[];
  relations: RelationConfig[];
}

export interface ModelRecord {
  slug: string;
  label: string;
  description: string;
  config: string;
  updated_at: string;
}

export interface ModelSummary {
  slug: string;
  label: string;
  description: string;
  updated_at: string;
}

export interface BusinessTypeInfo {
  value: BusinessType;
  label: string;
}

export interface ForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

export interface PhysicalColumn {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default?: string;
}

export interface PhysicalTable {
  name: string;
  columns: PhysicalColumn[];
  primary_keys: string[];
  foreign_keys: ForeignKey[] | null;
}

export interface RuntimeField {
  key: string;
  physical: string;
  label: string;
  business_type: BusinessType;
  required: boolean;
  editable: boolean;
  list_show: boolean;
  searchable: boolean;
  sort: number;
  placeholder?: string;
  options?: SelectOption[];
}

export interface RuntimeTable {
  alias: string;
  physical: string;
  label: string;
  primary_key: string;
  fields: RuntimeField[];
}

export interface RuntimeRelation {
  id: string;
  type: RelationType;
  from_alias: string;
  from_column: string;
  to_alias: string;
  to_column: string;
  join_table?: string;
  join_from_column?: string;
  join_to_column?: string;
  label?: string;
}

export interface RuntimeSchema {
  slug: string;
  label: string;
  description: string;
  root_alias: string;
  tables: RuntimeTable[];
  relations: RuntimeRelation[];
  business_types: BusinessTypeInfo[];
  updated_at: string;
}

export interface RuntimeRowResponse {
  fields: RuntimeField[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  search: string;
  primary: string;
  slug: string;
  label: string;
}

export interface ExpandedRow {
  id: string;
  type: RelationType;
  label: string;
  target: string;
  join?: string;
  rows: Record<string, unknown>[];
}

export interface RowDetail {
  row: Record<string, unknown>;
  relations: ExpandedRow[];
  primary: string;
}

export interface RowMutationInput {
  values: Record<string, unknown>;
  relations?: Record<string, Array<number | string>>;
}