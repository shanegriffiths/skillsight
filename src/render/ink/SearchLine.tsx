import { Text } from 'ink';
import { theme } from './theme.js';

/**
 * The one-line find-as-you-type box, rendered INSIDE a table box directly
 * under the column-header rule (above the first row). `count` is the
 * `matches/total` string from liveFilter's match-count helpers.
 */
export function SearchLine({ query, count }: { query: string; count: string }) {
  return (
    <Text wrap="truncate-end">
      {' '}
      <Text color={theme.accent} bold>
        /
      </Text>{' '}
      <Text bold>{query}</Text>
      <Text color={theme.accent}>▌</Text>
      <Text dimColor>  {count}</Text>
    </Text>
  );
}
