import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';
import { Badges } from './Badges.js';
import { marksFor, MARK_COUNT } from './runtimeMark.js';
import { theme } from './theme.js';

const CURSOR_W = 2;
const KIND_W = 6;
const USED_W = 4;
const USES_W = MARK_COUNT; // one cell per detected-runtime badge
const STATE_W = 11; // longest label: 'invoke-only'
const SOURCE_W = 22;

function HeaderRow({
  showKind,
  showMarks,
  showSource,
  showState,
  withCursor,
}: {
  showKind: boolean;
  showMarks: boolean;
  showSource: boolean;
  showState: boolean;
  withCursor: boolean;
}) {
  return (
    <Box>
      {withCursor ? <Box width={CURSOR_W} /> : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor bold>
            KIND
          </Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text dimColor bold>
          NAME
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor bold>
          USED
        </Text>
      </Box>
      {showMarks ? (
        <Box width={USES_W} marginRight={1}>
          <Text dimColor bold>
            USES
          </Text>
        </Box>
      ) : null}
      {showState ? (
        <Box width={STATE_W} marginRight={1}>
          <Text dimColor bold>
            STATE
          </Text>
        </Box>
      ) : null}
      {showSource ? (
        <Box width={SOURCE_W}>
          <Text dimColor bold>
            SOURCE
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function Row({
  row,
  showKind,
  showMarks,
  showSource,
  showState,
  withCursor,
  active,
}: {
  row: ItemRow;
  showKind: boolean;
  showMarks: boolean;
  showSource: boolean;
  showState: boolean;
  withCursor: boolean;
  active: boolean;
}) {
  const isGroup = row.expandState !== undefined;
  const marker = row.expandState === 'expanded' ? '▾' : row.expandState === 'collapsed' ? '▸' : '';
  const label = isGroup ? `${marker} ${row.name} (${row.used})` : row.depth ? `  ${row.name}` : row.name;
  const used = isGroup ? '' : row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  const source = isGroup ? '' : row.source ?? '';
  const marks = showMarks ? marksFor(row.usedRuntimes ?? []) : [];
  return (
    <Box>
      {withCursor ? (
        <Box width={CURSOR_W}>
          <Text color={theme.accent} bold>
            {active ? '›' : ' '}
          </Text>
        </Box>
      ) : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end" inverse={active} bold={active || isGroup} dimColor={!!row.parked && !active}>
          {label}
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      {showMarks ? (
        <Box width={USES_W} marginRight={1}>
          <Badges marks={marks} />
        </Box>
      ) : null}
      {showState ? (
        <Box width={STATE_W} marginRight={1}>
          <Text
            color={
              row.state === 'off' || row.state === 'disabled'
                ? theme.bad
                : row.state === undefined && !isGroup
                  ? theme.good
                  : undefined
            }
            dimColor={row.state !== 'off' && row.state !== 'disabled'}
          >
            {/* absent state = plainly available; render an explicit dim-green "enabled" (group headers stay blank) */}
            {row.state ?? (isGroup ? '' : 'enabled')}
          </Text>
        </Box>
      ) : null}
      {showSource ? (
        <Box width={SOURCE_W}>
          <Text wrap="truncate-end" dimColor={row.sourceDim}>
            {source}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function ItemTable({
  rows,
  showKind = true,
  showMarks = false,
  dense = false,
  selectedIndex,
}: {
  rows: ItemRow[];
  showKind?: boolean;
  /** Render the USES badge column. */
  showMarks?: boolean;
  /** Cramped Folders column: drop KIND + SOURCE so name + USES fit at 80 cols. */
  dense?: boolean;
  /** Index (within `rows`) of the highlighted row; omit for no cursor (e.g. an unfocused preview). */
  selectedIndex?: number;
}) {
  const withCursor = selectedIndex !== undefined;
  const effShowKind = showKind && !dense;
  const showSource = !dense;
  const showState = !dense;
  return (
    <Box flexDirection="column">
      <HeaderRow showKind={effShowKind} showMarks={showMarks} showSource={showSource} showState={showState} withCursor={withCursor} />
      {rows.map((r, i) => (
        <Row
          key={i}
          row={r}
          showKind={effShowKind}
          showMarks={showMarks}
          showSource={showSource}
          showState={showState}
          withCursor={withCursor}
          active={i === selectedIndex}
        />
      ))}
    </Box>
  );
}
