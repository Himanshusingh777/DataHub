// Removed — schema service deleted. Stub preserved (typed against the real
// call site in flows/[id]/page.tsx's SchemaPanel) so the app compiles;
// real schema discovery is connector-framework phase work.
export interface ObjectSchemaField {
  name: string;
  type: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  description?: string;
}

// Alias kept for lib/engine/semantic.ts's classifySchema(), which consumes
// the same shape under its original name.
export type SchemaField = ObjectSchemaField;

export interface ObjectSchema {
  id: string;
  name: string;
  syncMode?: "incremental" | "full";
  fields: ObjectSchemaField[];
}

export const SchemaService = {
  getConnectorSchema: (_slug: string): Promise<ObjectSchema[]> => Promise.resolve([]),
  typeColor: (_type: string): string => "text-muted-foreground bg-muted",
  formatType: (type: string): string => type,
};
