/** Shared "N skills · N plugins · N mcp" formatting (plain report + Ink bands). */
export function formatCounts(c: { skills: number; plugins: number; mcp: number }): string {
  return `${c.skills} skills · ${c.plugins} plugins · ${c.mcp} mcp`;
}
