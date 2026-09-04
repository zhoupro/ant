export interface Column {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default?: string;
}

export interface DBStatus {
  loaded: boolean;
  path?: string;
  name?: string;
  size?: number;
  tables?: number;
  error?: string;
}

export interface RowsResponse {
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  search: string;
}

export interface CreateTableColumn {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default: string;
}

export interface CreateTableInput {
  name: string;
  columns: CreateTableColumn[];
}

export interface AddColumnInput {
  name: string;
  type: string;
  notnull: boolean;
  default: string;
}

export interface RowInput {
  values: Record<string, unknown>;
}