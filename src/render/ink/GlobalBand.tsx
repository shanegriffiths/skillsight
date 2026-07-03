import { Text } from 'ink';
import type { Inventory } from '../../types.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
import { Band } from './Band.js';
import { bucketCounts } from '../../resolve.js';
import { formatCounts } from '../format.js';

export function GlobalBand({ inv }: { inv: Inventory }) {
  const g = inv.global;
  return (
    <Band>
      <Text>
        <Text bold>GLOBAL</Text> <Text dimColor>inherited everywhere</Text>
      </Text>
      <Text>
        {formatCounts(bucketCounts(g))}
        {'   '}
        <Text dimColor>runtimes: </Text>
        {inv.runtimesDetected.length ? (
          <Badges marks={marksFor(inv.runtimesDetected)} />
        ) : (
          <Text dimColor>none</Text>
        )}
      </Text>
    </Band>
  );
}
