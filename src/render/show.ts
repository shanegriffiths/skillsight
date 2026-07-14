/** Plain-text panel for `skillsight show` on a TTY (the JSON path is the contract). */
import type { ShowRecord } from '../show.js';

function repoKey(c: ShowRecord['copies'][number]): string {
  if (!c.git) return '(no repo)';
  return c.git.isWorktree ? (c.git.mainCheckout ?? c.git.repoRoot) : c.git.repoRoot;
}

export function renderShowPanel(rec: ShowRecord): string {
  const L: string[] = [];
  L.push(`${rec.item.name}  ·  ${rec.kind}  ·  scanned ${rec.scanTime}`);
  if ('scope' in rec.item) L.push(`scope     ${rec.item.scope}`);
  if ('usedBy' in rec.item && rec.item.usedBy.length) L.push(`used by   ${rec.item.usedBy.join(', ')}`);

  if (rec.copies.length) {
    L.push('', `copies (${rec.copies.length})`);
    const groups = new Map<string, ShowRecord['copies']>();
    for (const c of rec.copies) {
      const k = repoKey(c);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
    }
    for (const [root, copies] of groups) {
      const wts = copies.filter((c) => c.git?.isWorktree).length;
      const label = wts
        ? `${root} — main checkout + ${wts} worktree${wts === 1 ? '' : 's'}`
        : root;
      L.push(`  ${label}`);
      for (const c of copies) {
        const mark = c.git?.isWorktree ? '  (worktree)' : '';
        L.push(`    ${c.path}${mark}  [${c.folders.join(', ')}]`);
      }
    }
  }
  if (rec.sites.length) {
    L.push('', `sites (${rec.sites.length})`);
    for (const s of rec.sites) L.push(`  ${s.runtime}  ${s.linkPath}`);
  }
  if (rec.collisions.length) {
    L.push('', `collisions (${rec.collisions.length}) — same name, different content`);
    for (const c of rec.collisions) L.push(`  ${c.name} · ${c.kind} · ${c.id.slice(0, 12)} · ${c.folders.join(', ')}`);
  }
  const id = 'contentId' in rec.item ? rec.item.contentId.slice(0, 12) : ('id' in rec.item ? rec.item.id : rec.item.name);
  L.push('', `agent → skillsight show ${id} --json`);
  return L.join('\n');
}
