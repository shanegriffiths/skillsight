import { Box, Text, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { TABS, type TabId } from './tabs.js';
import { summaryStats, installed } from './stats.js';
import { bucketCounts, bucketTotal } from '../../resolve.js';
import { formatCounts } from '../format.js';
import { WORDMARK, WORDMARK_WIDTH } from './wordmark.js';
import { theme } from './theme.js';

/**
 * Static height estimate (art visible): 6 art + 1 hints + 3 tab chips
 * + 2 gaps (the chip row has BOTH marginTop and marginBottom) + 1 meta
 * + 2 border = 15. This MUST equal the box's real rendered height: an
 * undercount silently eats each view's SCREEN_RESERVE, putting a full-height
 * list back at Ink's fullscreen `clearTerminal` threshold — heavy flicker on
 * scroll. On a small terminal the art is dropped and the box is shorter, so
 * this over-reserves by a few rows there, which is harmless (a slightly shorter
 * list, never flicker). Pinned by test/headerBoxHeight.test.ts.
 */
export const HEADER_BOX_HEIGHT = 15;

/** Below these the ANSI-Shadow wordmark is dropped for a plain title. The width
 *  margin keeps the art off the edges (at ~80 cols it renders but crowds the
 *  metadata line), so we only show it with comfortable room to spare. */
const MIN_ART_COLS = WORDMARK_WIDTH + 18;
const MIN_ART_ROWS = 30;

/** The per-tab metadata line: what the active tab is looking at. The home path
 *  lives here now (in brackets) — the header line under the wordmark carries the
 *  key hints instead. */
function MetaLine({ inv, tab }: { inv: Inventory; tab: TabId }) {
  // The Folders tab is about the folders themselves, not the global layer.
  if (tab === 'folders') {
    const n = inv.folders.length;
    const withConfig = inv.folders.filter((f) => bucketTotal(f.projectScoped) + bucketTotal(f.local) > 0).length;
    return (
      <Text wrap="truncate-end">
        <Text bold>FOLDERS</Text>{' '}
        <Text dimColor>
          {n} discovered ({inv.homeRoot}) · {withConfig} add beyond the global layer
        </Text>
      </Text>
    );
  }

  let label: string;
  let gloss: string;
  let counts: { skills: number; plugins: number; mcp: number };
  if (tab === 'leaderboard') {
    label = 'EVERYTHING';
    gloss = 'distinct across the machine';
    counts = summaryStats(inv).totals;
  } else if (tab === 'installed') {
    label = 'PROJECT SCOPE';
    gloss = 'installed across all projects';
    const rows = installed(inv);
    counts = {
      skills: rows.filter((r) => r.kind === 'skill').length,
      plugins: rows.filter((r) => r.kind === 'plugin').length,
      mcp: rows.filter((r) => r.kind === 'mcp').length,
    };
  } else {
    label = 'USER SCOPE';
    gloss = 'inherited everywhere';
    counts = bucketCounts(inv.global);
  }
  return (
    <Text wrap="truncate-end">
      <Text bold>{label}</Text> <Text dimColor>{gloss}</Text> · {formatCounts(counts)}
      {tab === 'leaderboard' ? <Text dimColor> · USES = Claude Code usage</Text> : null}{' '}
      <Text dimColor>({inv.homeRoot})</Text>
    </Text>
  );
}

function Status({ status, warnings }: { status: 'idle' | 'rescanning'; warnings: number }) {
  return (
    <Text>
      {status === 'rescanning' ? (
        <Text color={theme.warn}>● rescanning</Text>
      ) : (
        <Text color={theme.good}>● live</Text>
      )}
      {warnings > 0 ? <Text color={theme.warn}> · ⚠ {warnings}</Text> : null}
    </Text>
  );
}

/** Just the wordmark (or a plain title on a small terminal). The path/status/key
 *  hints render on the line below it, in HeaderBox. */
function Title() {
  const size = useWindowSize();
  const showArt = size.columns >= MIN_ART_COLS && size.rows >= MIN_ART_ROWS;
  if (!showArt) {
    return <Text bold>skillsight</Text>;
  }
  return (
    <Box flexDirection="column">
      {WORDMARK.map((line, i) => (
        <Text key={i} color={theme.accent}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

/**
 * The framed header: the ANSI-Shadow wordmark (or a plain title on a small
 * terminal), the active view's key hints + live status, a row of bordered tab
 * chips, and the per-tab metadata line. Filters live at the bottom of the app.
 */
export function HeaderBox({
  inv,
  status,
  tab,
  controls,
}: {
  inv: Inventory;
  status: 'idle' | 'rescanning';
  tab: TabId;
  /** The active view's per-focus key hints, lifted up from that view. */
  controls: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Box justifyContent="space-between" alignItems="flex-start">
        <Title />
        <Status status={status} warnings={inv.warnings.length} />
      </Box>
      <Text dimColor wrap="truncate-end">{controls}</Text>
      <Box marginTop={1} marginBottom={1}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Box
              key={t.id}
              borderStyle="round"
              borderColor={active ? theme.accent : theme.border}
              paddingX={1}
              marginRight={1}
            >
              <Text dimColor={!active}>{t.key} </Text>
              <Text bold={active} color={active ? theme.accent : undefined}>
                {t.label}
              </Text>
            </Box>
          );
        })}
      </Box>
      <MetaLine inv={inv} tab={tab} />
    </Box>
  );
}
