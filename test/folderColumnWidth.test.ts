// A deep, unbreakable folder path (e.g. a Google Drive shared drive) selected in
// the folders view must NOT starve the fixed-width sidebar. Without flexShrink:0
// on the folder column, the greedy right column (whose long path has a huge
// min-content width) shrinks the sidebar until Ink truncates every row's trailing
// count to "…". Regression guard: render the real FolderList beside a long-path
// right column at ink-testing-library's 100-col width and assert the counts survive.
import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { buildFolderRows } from '../src/render/ink/tree.js';
import { FolderList } from '../src/render/ink/FolderList.js';
import { icons } from '../src/render/ink/icons.js';
import { emptyBucket, type Bucket, type FolderReport, type SkillRecord } from '../src/types.js';

const HOME = '/home/u';
const LONG = `${HOME}/Library/CloudStorage/GoogleDrive-shane@studiobr.io/Shared drives/Snowbridge Web Projects/Snowbridge Studio/Guidelines`;

function skills(n: number): Bucket {
  const mk = (i: number): SkillRecord => ({
    name: `s${i}`, description: 'x', contentId: `/p/s${i}`,
    provider: { kind: 'user', path: `/p/s${i}` }, usedBy: ['claude-code'], enabled: true, scope: 'project-scoped',
  });
  return { ...emptyBucket(), skills: Array.from({ length: n }, (_, i) => mk(i)) };
}
function folder(path: string, ps: Bucket): FolderReport {
  return { path, group: 'g', runtimes: ['claude-code'], global: emptyBucket(), projectScoped: ps, local: emptyBucket(), effective: ps };
}

const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

function frame(rightPath: string): string {
  const folders = [
    folder(`${HOME}/Developer/Projects/studiobrio`, skills(7)),
    folder(`${HOME}/Developer/Projects/skillsight`, skills(12)),
    folder(LONG, emptyBucket()),
  ];
  const rows = buildFolderRows(folders, HOME, { sort: 'items', showHidden: false });
  const { lastFrame } = render(
    h(Box, null,
      h(FolderList, { rows, selected: 0, dimmed: true, width: icons.enabled ? 36 : 34 }),
      h(Box, { flexDirection: 'column', flexGrow: 1, marginLeft: 1 },
        h(Text, { wrap: 'truncate-end' }, rightPath),
      ),
    ),
  );
  return stripAnsi(lastFrame() ?? '');
}

describe('folder column width', () => {
  it('keeps sidebar counts when a long unbreakable path is shown beside it', () => {
    const out = frame(`~/Library/CloudStorage/GoogleDrive-shane@studiobr.io/Shared drives/Snowbridge Web Projects/Snowbridge Studio/Guidelines`);
    // The counts must survive — the sidebar must not have been squeezed to "…".
    expect(out).toContain('+12');
    expect(out).toContain('+7');
  });

  it('shows the same counts regardless of the neighbouring path length', () => {
    const shortOut = frame('~/Developer/Projects/skillsight');
    expect(shortOut).toContain('+12');
    expect(shortOut).toContain('+7');
  });
});
