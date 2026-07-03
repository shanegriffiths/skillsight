/**
 * Default grouped report: the global layer once, then each folder's delta
 * (what it adds), with a dim `global only` tag when a folder adds nothing.
 * `--full` prints each folder's complete effective set; `--provenance` expands
 * provider + `used by` per item.
 */
import { basename } from 'node:path';
import pc from 'picocolors';
import type { Bucket, Inventory, McpRecord, PluginRecord, SkillRecord } from '../types.js';
import { bucketCounts, bucketTotal } from '../resolve.js';
import { isHiddenFolder } from './hidden.js';
import { formatCounts } from './format.js';

export interface PlainOptions {
  full?: boolean;
  provenance?: boolean;
  globalOnly?: boolean;
}

function counts(b: Bucket): string {
  return formatCounts(bucketCounts(b));
}

function skillLine(s: SkillRecord, prov: boolean, prefix: string): string {
  const src = s.provider.source ? ` ${s.provider.source}` : '';
  const tag = pc.dim(`[${s.provider.kind}${src}]`);
  const off = s.enabled ? '' : pc.red(' (disabled)');
  const used = prov ? pc.dim(`\n      used by: ${s.usedBy.join(', ') || '—'}`) : '';
  return `${prefix}${s.name} ${tag}${off}${used}`;
}

function pluginLine(p: PluginRecord, prov: boolean, prefix: string): string {
  const off = p.enabled ? '' : pc.red(' (disabled)');
  const tag = pc.dim(`[${p.marketplace || 'plugin'}@${p.version}]`);
  const extra = prov ? pc.dim(`\n      supports: ${p.supportsRuntimes.join(', ')}`) : '';
  return `${prefix}${p.name} ${tag}${off}${extra}`;
}

function mcpLine(m: McpRecord, prov: boolean, prefix: string): string {
  const off = m.enabled ? '' : pc.red(' (pending/disabled)');
  const t = m.transport;
  let extra = '';
  if (prov) {
    const bits: string[] = [];
    if (t.command) bits.push([t.command, ...(t.args ?? [])].join(' '));
    if (t.url) bits.push(t.url);
    // PRIVACY: key NAMES only — the records never carry env/header values.
    if (t.envKeys?.length) bits.push(`env keys: ${t.envKeys.join(', ')}`);
    if (t.headerKeys?.length) bits.push(`header keys: ${t.headerKeys.join(', ')}`);
    bits.push(`scope: ${m.scope}`);
    extra = pc.dim(`\n      ${bits.join(' · ')}`);
  }
  return `${prefix}${m.name} ${pc.dim(`[mcp ${t.kind}]`)}${off}${extra}`;
}

function renderBucket(b: Bucket, opts: PlainOptions, prefix: string): string[] {
  const lines: string[] = [];
  for (const s of b.skills) lines.push(skillLine(s, !!opts.provenance, `${prefix}`));
  for (const p of b.plugins) lines.push(pluginLine(p, !!opts.provenance, `${prefix}`));
  for (const m of b.mcp) lines.push(mcpLine(m, !!opts.provenance, `${prefix}`));
  return lines;
}

export function renderPlain(inv: Inventory, opts: PlainOptions = {}): string {
  const out: string[] = [];
  const folders = inv.folders.filter((f) => !isHiddenFolder(f.path, inv.homeRoot));
  const folderCount = folders.length;
  out.push(
    `${pc.bold('skillsight')}  ${pc.dim(inv.homeRoot)}  ·  runtimes: ${
      inv.runtimesDetected.join(', ') || pc.dim('none')
    }  ·  ${folderCount} folder${folderCount === 1 ? '' : 's'}`,
  );
  if (inv.warnings.length) {
    out.push(pc.yellow(`⚠ ${inv.warnings.length} unreadable source${inv.warnings.length === 1 ? '' : 's'}`));
  }

  out.push('', pc.bold('GLOBAL') + pc.dim('  inherited everywhere') + `  (${counts(inv.global)})`);
  out.push(...renderBucket(inv.global, opts, '  - '));

  if (opts.globalOnly) return out.join('\n');

  let group = '';
  for (const f of folders) {
    if (f.group !== group) {
      group = f.group;
      out.push('', pc.bold(group));
    }
    const delta = bucketTotal(f.projectScoped) + bucketTotal(f.local);
    const name = basename(f.path) || f.path;
    if (delta === 0 && !opts.full) {
      out.push(`  ${name}  ${pc.dim('global only')}`);
      continue;
    }
    out.push(`  ${pc.underline(name)}`);
    if (opts.full) {
      out.push(...renderBucket(f.effective, opts, '    · '));
    } else {
      out.push(...renderBucket(f.projectScoped, opts, '    + '));
      out.push(...renderBucket(f.local, opts, '    + '));
    }
  }

  return out.join('\n');
}
