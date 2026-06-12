// STUB — replaced by the Templates agent.
// Contract: TEMPLATES is the gallery source; create() builds the pages and
// returns the root page id.
export interface TemplateDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  create: (parentId: string | null) => string;
}

export const TEMPLATES: TemplateDef[] = [];
