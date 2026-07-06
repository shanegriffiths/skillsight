/** Single source of truth for the tab set: order, number keys, labels. */
export type TabId = 'folders' | 'installed' | 'global' | 'leaderboard';

export interface TabDef {
  id: TabId;
  key: string;
  label: string;
}

export const TABS: TabDef[] = [
  { id: 'folders', key: '1', label: 'Projects' },
  { id: 'installed', key: '2', label: 'Installed' },
  { id: 'global', key: '3', label: 'User Scope (Global)' },
  { id: 'leaderboard', key: '4', label: 'Leaderboard' },
];

export function tabForKey(input: string): TabId | undefined {
  return TABS.find((t) => t.key === input)?.id;
}

export function nextTab(current: TabId, dir: 1 | -1): TabId {
  const i = TABS.findIndex((t) => t.id === current);
  return TABS[(i + dir + TABS.length) % TABS.length]!.id;
}
