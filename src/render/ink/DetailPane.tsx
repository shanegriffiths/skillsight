import { Box, Text } from 'ink';
import type { Bucket, FolderReport } from '../../types.js';

function Section({ title, b }: { title: string; b: Bucket }) {
  const items = [
    ...b.skills.map((s) => ({ label: s.name, tag: s.provider.kind })),
    ...b.plugins.map((p) => ({ label: p.name, tag: `plugin ${p.marketplace}` })),
    ...b.mcp.map((m) => ({ label: m.name, tag: `mcp ${m.transport.kind}` })),
  ];
  if (items.length === 0) return null;
  return (
    <Box flexDirection="column">
      <Text bold>
        {title} <Text dimColor>({items.length})</Text>
      </Text>
      {items.slice(0, 20).map((it, i) => (
        <Text key={`${title}-${i}`} wrap="truncate-end">
          {'  '}
          {it.label} <Text dimColor>[{it.tag}]</Text>
        </Text>
      ))}
      {items.length > 20 ? <Text dimColor>{'  '}…and {items.length - 20} more</Text> : null}
    </Box>
  );
}

export function DetailPane({ folder }: { folder: FolderReport | undefined }) {
  if (!folder) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>select a folder</Text>
      </Box>
    );
  }
  const empty =
    folder.projectScoped.skills.length +
      folder.projectScoped.plugins.length +
      folder.projectScoped.mcp.length +
      folder.local.skills.length +
      folder.local.mcp.length ===
    0;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {folder.path}
      </Text>
      {empty ? <Text dimColor>global only — adds nothing beyond the inherited layer</Text> : null}
      <Section title="project-scoped" b={folder.projectScoped} />
      <Section title="local" b={folder.local} />
    </Box>
  );
}
