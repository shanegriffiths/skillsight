import type { McpRecord, PluginRecord, SkillRecord } from '../../types.js';
import type { ItemRow } from './rows.js';
import { namesFor } from './runtimeMark.js';

export interface DetailField {
  label: string;
  value: string;
  dim?: boolean;
  /** When true, the view renders `value` as a terminal hyperlink. */
  link?: boolean;
  /** When true, the view wraps `value` across lines in full instead of truncating. */
  wrap?: boolean;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

/** The ref an agent passes to `skillsight show` for this row's record. */
export function agentRef(row: ItemRow): string | undefined {
  if (!row.record) return undefined;
  if (row.kind === 'skill') return (row.record as SkillRecord).contentId.slice(0, 12);
  if (row.kind === 'plugin') return (row.record as PluginRecord).id;
  return row.name;
}

/** The screenshot-visible handshake: how an agent re-fetches this record. */
export function agentCommand(row: ItemRow): string | undefined {
  const ref = agentRef(row);
  return ref ? `skillsight show ${ref} --json` : undefined;
}

/** Compact relative time for a `lastUsedAt` epoch-ms against `now`. */
export function formatLastUsed(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function skillFields(s: SkillRecord): DetailField[] {
  const f: DetailField[] = [{ label: 'kind', value: 'skill' }];
  f.push({ label: 'used by', value: namesFor(s.usedBy), dim: s.usedBy.length === 0 });
  if (s.usageCount !== undefined) {
    f.push({ label: 'uses', value: `${s.usageCount} · Claude Code`, dim: s.usageCount === 0 });
    if (s.lastUsedAt !== undefined) f.push({ label: 'last used', value: formatLastUsed(s.lastUsedAt, Date.now()), dim: true });
  }
  if (s.provider.source) {
    f.push({ label: 'source', value: s.provider.source });
    if (s.provider.sourceUrl) f.push({ label: 'url', value: s.provider.sourceUrl, dim: true, link: true });
  } else {
    f.push({ label: 'source', value: s.provider.kind, dim: true });
  }
  f.push({ label: 'scope', value: s.scope });
  if (s.bundledInPlugin) f.push({ label: 'plugin', value: s.bundledInPlugin });
  if (s.visibility) {
    const promoted = s.visibility === 'on' && s.visibilitySource !== 'user' ? ' — promoted' : '';
    f.push({ label: 'visibility', value: `${s.visibility} (${s.visibilitySource}${promoted})` });
  }
  if (!s.enabled) f.push({ label: 'enabled', value: 'no', dim: true });
  f.push({ label: 'path', value: s.provider.path, dim: true });
  f.push({ label: 'id', value: shortId(s.contentId), dim: true });
  if (s.description) f.push({ label: 'about', value: s.description, wrap: true });
  return f;
}

function pluginFields(p: PluginRecord): DetailField[] {
  const pr = p.provides;
  const provides = `${pr.skills.length} skills · ${pr.commands.length} commands · ${pr.agents.length} agents · ${pr.mcpServers.length} mcp`;
  const f: DetailField[] = [
    { label: 'kind', value: 'plugin' },
    { label: 'provides', value: provides },
    { label: 'marketplace', value: p.marketplaceRepo ?? p.marketplace, dim: !p.marketplaceRepo },
    { label: 'scope', value: p.scope },
  ];
  if (p.override) f.push({ label: 'enabled via', value: `${p.override} settings override` });
  f.push({ label: 'version', value: p.version, dim: true });
  if (p.description) f.push({ label: 'about', value: p.description, wrap: true });
  return f;
}

function mcpFields(m: McpRecord): DetailField[] {
  const t = m.transport;
  const f: DetailField[] = [
    { label: 'kind', value: 'mcp' },
    { label: 'transport', value: t.kind },
  ];
  if (t.command) f.push({ label: 'command', value: [t.command, ...(t.args ?? [])].join(' ') });
  if (t.url) f.push({ label: 'url', value: t.url, link: true });
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
  const fields = (() => {
    switch (row.kind) {
      case 'skill':
        return skillFields(row.record as SkillRecord);
      case 'plugin':
        return pluginFields(row.record as PluginRecord);
      case 'mcp':
        return mcpFields(row.record as McpRecord);
    }
  })();
  const cmd = agentCommand(row);
  if (cmd) fields.push({ label: 'agent', value: cmd, dim: true });
  return fields;
}
