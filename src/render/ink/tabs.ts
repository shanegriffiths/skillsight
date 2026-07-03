/** Single source of truth for the tab set: order, number keys, labels. */
export type TabId = 'folders' | 'global' | 'leaderboard';

export interface TabDef {
  id: TabId;
  key: string;
  label: string;
}

export const TABS: TabDef[] = [
  { id: 'folders', key: '1', label: 'Folders' },
  { id: 'global', key: '2', label: 'Global' },
  { id: 'leaderboard', key: '3', label: 'Leaderboard' },
];

export function tabForKey(input: string): TabId | undefined {
  return TABS.find((t) => t.key === input)?.id;
}

export function nextTab(current: TabId, dir: 1 | -1): TabId {
  const i = TABS.findIndex((t) => t.id === current);
  return TABS[(i + dir + TABS.length) % TABS.length]!.id;
}
