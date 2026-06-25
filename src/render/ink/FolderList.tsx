import { Box, Text } from 'ink';
import type { FolderReport } from '../../types.js';
import { bucketCounts } from '../../resolve.js';

function delta(f: FolderReport): number {
  const ps = bucketCounts(f.projectScoped);
  const lo = bucketCounts(f.local);
  return ps.skills + ps.plugins + ps.mcp + lo.skills + lo.plugins + lo.mcp;
}

export function FolderList({
  folders,
  selected,
  dimmed = false,
}: {
  folders: FolderReport[];
  selected: number;
  dimmed?: boolean;
}) {
  return (
    <Box flexDirection="column" width={42} marginRight={1}>
      {folders.length === 0 ? <Text dimColor>no folders discovered</Text> : null}
      {folders.map((f, i) => {
        const name = f.path.split('/').pop() || f.path;
        const d = delta(f);
        const active = i === selected;
        const globalOnly = d === 0;
        return (
          <Text
            key={f.path}
            inverse={active && !dimmed}
            dimColor={dimmed || (globalOnly && !active)}
            wrap="truncate-end"
          >
            {active ? '› ' : '  '}
            {name}
            {d > 0 ? <Text color="cyan"> +{d}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
