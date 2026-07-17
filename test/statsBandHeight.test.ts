// The leaderboard tab (the only view with showStats) budgets STATS_BAND_LINES
// rows for its stats band. If that constant undercounts the band's true height,
// the undercount cancels SCREEN_RESERVE and the full-height leaderboard lands at
// exactly the terminal height — Ink's fullscreen clearTerminal threshold — which
// reads as flicker on scroll. This pins the constant to the band's real height.
import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { StatsBand, STATS_BAND_LINES } from '../src/render/ink/RankedView.js';
import type { SummaryStats } from '../src/render/ink/stats.js';

const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

const fixture: SummaryStats = {
  totals: { skills: 40, plugins: 7, mcp: 3 },
  perRuntime: [
    { runtime: 'claude-code', skills: 12 },
    { runtime: 'codex', skills: 3 },
  ],
  perProvider: [
    { kind: 'shared-store', skills: 40 },
    { kind: 'plugin', skills: 7 },
  ],
};

describe('stats band height budget', () => {
  it('STATS_BAND_LINES equals the band real rendered height', () => {
    // Rendered AFTER a sibling line (the Position line in RankedView) so the
    // band's marginTop=1 actually produces its blank row, as it does in situ.
    const { lastFrame } = render(
      h(
        Box,
        { flexDirection: 'column' },
        h(Text, null, '1-20 of 99'), // stand-in for <Position/>
        h(StatsBand, { stats: fixture }),
      ),
    );
    const lines = stripAnsi(lastFrame() ?? '').split('\n');
    const bandRows = lines.length - 1; // subtract the one Position line
    expect(bandRows).toBe(STATS_BAND_LINES);
  });
});
