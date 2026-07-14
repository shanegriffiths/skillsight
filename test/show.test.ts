import { describe, expect, it, afterEach } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { scanFull } from '../src/index.js';
import { resolveRef, assembleShow, runShow } from '../src/show.js';
import { cleanup, makeTempHome, symlinkInto, writeFileEnsured, writeSkillDir } from './helpers.js';

describe('show', () => {
  let home: string;
  afterEach(() => cleanup(home));

  /** Two projects with a byte-identical skill + one same-name different-content skill. */
  function fixture() {
    home = makeTempHome();
    // A home-root `.claude` marker is required for the claude-code adapter to
    // activate at all (`detect()` checks `<home>/.claude` / `<home>/.claude.json`);
    // without it collectForDirectory never runs and the folders below stay empty.
    writeFileEnsured(join(home, '.claude', 'settings.json'), '{}');
    writeSkillDir(join(home, 'proj-a', '.claude', 'skills'), 'dupe', { description: 'same' });
    writeSkillDir(join(home, 'proj-b', '.claude', 'skills'), 'dupe', { description: 'same' });
    writeSkillDir(join(home, 'proj-c', '.claude', 'skills'), 'dupe', { description: 'DIFFERENT' });
    writeSkillDir(join(home, 'proj-a', '.claude', 'skills'), 'lonely');
    return scanFull(home, { walk: true });
  }

  it('resolves a unique name and lists every physical copy with folders', () => {
    const { inventory, sites } = fixture();
    const res = resolveRef(inventory, 'lonely');
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    expect(rec.schemaVersion).toBe(1);
    expect(rec.copies).toHaveLength(1);
    expect(rec.copies[0]!.folders).toEqual([join(home, 'proj-a')]);
    expect((rec.item as { copies?: unknown }).copies).toBeUndefined();
  });

  it('reports byte-identical cross-project copies and same-name collisions as ambiguity', () => {
    const { inventory } = fixture();
    // 'dupe' exists as two identities (a+b share a hash; c differs) -> ambiguous
    const res = resolveRef(inventory, 'dupe');
    expect(res.status).toBe('ambiguous');
    if (res.status !== 'ambiguous') return;
    expect(res.candidates).toHaveLength(2);
    const shared = res.candidates.find((c) => c.folders.length === 2)!;
    expect(shared.folders).toEqual([join(home, 'proj-a'), join(home, 'proj-b')]);
  });

  it('resolves an id prefix to one identity, with copies for both projects and the collision listed', () => {
    const { inventory, sites } = fixture();
    const amb = resolveRef(inventory, 'dupe');
    if (amb.status !== 'ambiguous') throw new Error('expected ambiguous');
    const sharedId = amb.candidates.find((c) => c.folders.length === 2)!.id;
    const res = resolveRef(inventory, sharedId.slice(0, 12));
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    // `provider.path` is always realpath-resolved (see types.ts); on macOS
    // `os.tmpdir()` lives under `/var`, a symlink to `/private/var`, so the
    // expected paths must be realpath'd too even though `home` itself need not be.
    const realHome = realpathSync(home);
    expect(rec.copies.map((c) => c.path).sort()).toEqual([
      join(realHome, 'proj-a', '.claude', 'skills', 'dupe'),
      join(realHome, 'proj-b', '.claude', 'skills', 'dupe'),
    ]);
    expect(rec.collisions).toHaveLength(1);
    expect(rec.collisions[0]!.folders).toEqual([join(home, 'proj-c')]);
  });

  it('includes symlink sites for hub-linked skills', () => {
    home = makeTempHome();
    const real = writeSkillDir(join(home, '.agents', 'skills'), 'hubbed');
    symlinkInto(join(home, '.claude', 'skills', 'hubbed'), real);
    const { inventory, sites } = scanFull(home, { walk: false });
    const res = resolveRef(inventory, 'hubbed');
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    expect(rec.sites).toContainEqual({
      runtime: 'claude-code',
      linkPath: join(home, '.claude', 'skills', 'hubbed'),
    });
  });

  it('runShow returns 1 with suggestions and 2 with candidates', () => {
    fixture();
    let err = '';
    const io = { out: () => {}, err: (s: string) => (err += s), isTTY: false, json: true };
    expect(runShow(home, { walk: true }, 'lonel', io)).toBe(1); // 5 chars, no id match, not exact
    expect(err).toContain('lonely');
    err = '';
    expect(runShow(home, { walk: true }, 'dupe', io)).toBe(2);
    expect(err).toContain('ambiguous');
    let out = '';
    const io0 = { out: (s: string) => (out += s), err: () => {}, isTTY: false, json: true };
    expect(runShow(home, { walk: true }, 'lonely', io0)).toBe(0);
    expect((JSON.parse(out) as { schemaVersion: number }).schemaVersion).toBe(1);
  });
});
