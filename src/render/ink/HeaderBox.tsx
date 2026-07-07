import { Box, Text, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { TABS, type TabId } from './tabs.js';
import { lettersFor } from './runtimeMark.js';
import { summaryStats, installed } from './stats.js';
import { bucketCounts, bucketTotal } from '../../resolve.js';
import { formatCounts } from '../format.js';
import { WORDMARK, WORDMARK_WIDTH } from './wordmark.js';
import { theme } from './theme.js';

/** Static height estimate (art visible): 6 art + 1 path + 3 tab chips + 1 gap + 1 meta + 2 border. */
export const HEADER_BOX_HEIGHT = 14;

/** Below these the ANSI-Shadow wordmark is dropped for a plain title. The width
 *  margin keeps the art off the edges (at ~80 cols it renders but crowds the
 *  metadata line), so we only show it with comfortable room to spare. */
const MIN_ART_COLS = WORDMARK_WIDTH + 18;
const MIN_ART_ROWS = 30;

/** The per-tab metadata line: what the active tab is looking at. */
function MetaLine({ inv, tab }: { inv: Inventory; tab: TabId }) {
  const letters = lettersFor(inv.runtimesDetected);
  const runtimes = (
    <>
      {'   '}
      <Text dimColor>runtimes:</Text> {letters || <Text dimColor>none</Text>}
    </>
  );

  // The Folders tab is about the folders themselves, not the global layer.
  if (tab === 'folders') {
    const n = inv.folders.length;
    const withConfig = inv.folders.filter((f) => bucketTotal(f.projectScoped) + bucketTotal(f.local) > 0).length;
    return (
      <Text>
        <Text bold>FOLDERS</Text> <Text dimColor>{n} discovered · {withConfig} add beyond the global layer</Text>
        {runtimes}
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
    <Text>
      <Text bold>{label}</Text> <Text dimColor>{gloss}</Text> · {formatCounts(counts)}
      {runtimes}
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

function Title({ inv, status }: { inv: Inventory; status: 'idle' | 'rescanning' }) {
  const size = useWindowSize();
  const showArt = size.columns >= MIN_ART_COLS && size.rows >= MIN_ART_ROWS;
  if (!showArt) {
    return (
      <Box justifyContent="space-between">
        <Text>
          <Text bold>skillsight</Text> <Text dimColor>{inv.homeRoot}</Text>
        </Text>
        <Status status={status} warnings={inv.warnings.length} />
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {WORDMARK.map((line, i) => (
        <Text key={i} color={theme.accent}>
          {line}
        </Text>
      ))}
      <Box justifyContent="space-between">
        <Text dimColor>{inv.homeRoot}</Text>
        <Status status={status} warnings={inv.warnings.length} />
      </Box>
    </Box>
  );
}

/**
 * The framed header: the ANSI-Shadow wordmark (or a plain title on a small
 * terminal), a row of bordered tab chips, and the per-tab metadata line.
 * Filters live at the bottom of the app now, not here.
 */
export function HeaderBox({
  inv,
  status,
  tab,
}: {
  inv: Inventory;
  status: 'idle' | 'rescanning';
  tab: TabId;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Title inv={inv} status={status} />
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
