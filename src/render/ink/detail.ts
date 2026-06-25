import type { McpRecord, PluginRecord, Runtime, SkillRecord } from '../../types.js';
import type { ItemRow } from './rows.js';

export interface DetailField {
  label: string;
  value: string;
  dim?: boolean;
}

function fmtRuntimes(r: Runtime[]): string {
  return r.length ? r.join(', ') : 'none';
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function skillFields(s: SkillRecord): DetailField[] {
  const f: DetailField[] = [{ label: 'kind', value: 'skill' }];
  f.push({ label: 'used by', value: fmtRuntimes(s.usedBy), dim: s.usedBy.length === 0 });
  if (s.provider.source) {
    f.push({ label: 'source', value: s.provider.source });
    if (s.provider.sourceUrl) f.push({ label: 'url', value: s.provider.sourceUrl, dim: true });
  } else {
    f.push({ label: 'source', value: s.provider.kind, dim: true });
  }
  f.push({ label: 'scope', value: s.scope });
  if (s.bundledInPlugin) f.push({ label: 'plugin', value: s.bundledInPlugin });
  if (!s.enabled) f.push({ label: 'enabled', value: 'no', dim: true });
  f.push({ label: 'path', value: s.provider.path, dim: true });
  f.push({ label: 'id', value: shortId(s.contentId), dim: true });
  if (s.description) f.push({ label: 'about', value: s.description });
  return f;
}

function pluginFields(p: PluginRecord): DetailField[] {
  const pr = p.provides;
  const provides = `${pr.skills.length} skills · ${pr.commands.length} commands · ${pr.agents.length} agents · ${pr.mcpServers.length} mcp`;
  return [
    { label: 'kind', value: 'plugin' },
    { label: 'provides', value: provides },
    { label: 'marketplace', value: p.marketplaceRepo ?? p.marketplace, dim: !p.marketplaceRepo },
    { label: 'scope', value: p.scope },
    { label: 'version', value: p.version, dim: true },
  ];
}

function mcpFields(m: McpRecord): DetailField[] {
  const t = m.transport;
  const f: DetailField[] = [
    { label: 'kind', value: 'mcp' },
    { label: 'transport', value: t.kind },
  ];
  if (t.command) f.push({ label: 'command', value: [t.command, ...(t.args ?? [])].join(' ') });
  if (t.url) f.push({ label: 'url', value: t.url });
  // PRIVACY: names only — the records never carry env/header values.
  if (t.envKeys?.length) f.push({ label: 'env', value: t.envKeys.join(', '), dim: true });
  if (t.headerKeys?.length) f.push({ label: 'headers', value: t.headerKeys.join(', '), dim: true });
  if (t.timeoutMs !== undefined) f.push({ label: 'timeout', value: `${t.timeoutMs}ms`, dim: true });
  f.push({ label: 'scope', value: m.scope });
  return f;
}

/** Labelled detail fields for a cursored row. `[]` for synthetic group headers (no record). */
export function detailFields(row: ItemRow): DetailField[] {
  if (!row.record) return [];
  switch (row.kind) {
    case 'skill':
      return skillFields(row.record as SkillRecord);
    case 'plugin':
      return pluginFields(row.record as PluginRecord);
    case 'mcp':
      return mcpFields(row.record as McpRecord);
  }
}
