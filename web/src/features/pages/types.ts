export interface Page {
  id: string;
  slug: string;
  label: string;
  icon: string;
  parent_id: string;
  model_slug: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface PageInput {
  slug: string;
  label: string;
  icon: string;
  parent_id: string;
  model_slug: string;
  sort: number;
}
