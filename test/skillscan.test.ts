import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeSkillDir, writeFileEnsured } from './helpers.js';
import { scanSkillsDir } from '../src/skillscan.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('scanSkillsDir', () => {
  it('treats only directories that contain a SKILL.md as skills', () => {
    home = makeTempHome();
    const dir = join(home, 'skills');
    writeSkillDir(dir, 'real');
    // a support dir holding docs but no SKILL.md is not a skill
    writeFileEnsured(join(dir, 'references', 'expressions.md'), '# shared refs\n');
    const skills = scanSkillsDir(dir, ctxOf(home), 'global');
    expect(skills.map((s) => s.name)).toEqual(['real']);
  });
});
