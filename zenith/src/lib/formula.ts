// STUB — replaced by the Databases agent.
// Contract: evalFormula(expr, ctx) -> string | number | boolean | null
//   ctx.prop(name) returns the value of another property for the row.
export interface FormulaCtx {
  prop: (name: string) => any;
}

export function evalFormula(expr: string, ctx: FormulaCtx): any {
  void expr; void ctx;
  return null;
}
