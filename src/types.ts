/**
 * Core data model for skillsight.
 *
 * The engine is renderer-agnostic: every adapter produces these records, the
 * resolver dedupes/links them, and renderers (plain / json / ink) consume the
 * resulting {@link Inventory}. Nothing here imports Node or writes to stdout.
 */

/** A runtime/agent id (e.g. `claude-code`, `codex`). Open — the registry grows. */
export type Runtime = string;

/** v1 inventory units. `rule` / `extension` / `agent` are roadmap. */
export type Kind = 'skill' | 'plugin' | 'mcp';

/** Where an item physically lives relative to inheritance. */
export type Scope = 'global' | 'project-scoped' | 'local';

/** Claude Code per-skill visibility state (settings `skillOverrides`). */
export type SkillVisibility = 'on' | 'name-only' | 'user-invocable-only' | 'off';

/** The settings layer whose `skillOverrides` entry decided a skill's visibility. */
export type VisibilitySource = 'user' | 'project' | 'local';

/**
 * Normalized MCP transport across all runtimes. Secret-bearing fields store
 * **key names only** (`envKeys` / `headerKeys`) — never values (privacy rule).
 */
export interface McpTransport {
  kind: 'stdio' | 'http' | 'sse' | 'ws';
  // stdio
  command?: string;
  args?: string[];
  envKeys?: string[];
  cwd?: string;
  // http / sse / ws
  url?: string;
  headerKeys?: string[];
  /** Normalized to milliseconds (Codex configs use seconds). */
  timeoutMs?: number;
  /**
   * When a runtime's config can't disambiguate the transport (e.g. Cursor
   * remote servers have no `type`), this records the assumption made.
   */
  note?: string;
}

/** Provenance: where a logical item came from. */
export interface Provider {
  kind:
    | 'shared-store'
    | 'plugin'
    | 'personal-repo'
    | 'runtime-builtin'
    | 'user'
    | 'project-local';
  /** From `.skill-lock.json` — `"owner/repo"`. */
  source?: string;
  sourceUrl?: string;
  /** git tree SHA from `.skill-lock.json`; the dedupe key when present. */
  skillFolderHash?: string;
  /** e.g. `superpowers@claude-plugins-official`. */
  pluginId?: string;
  marketplace?: string;
  marketplaceRepo?: string;
  /** Physical content location, symlink-resolved (`fs.realpath`). */
  path: string;
}

/** A physical duplicate of a skill's content that dedup merged away. */
export interface SkillCopy {
  path: string;
  providerKind: Provider['kind'];
}

export interface SkillRecord {
  name: string;
  description?: string;
  /** `skillFolderHash` if known, else `fs.realpath` of the skill dir. */
  contentId: string;
  provider: Provider;
  /** Runtimes that consume this skill (registry-wide reverse-symlink scan). */
  usedBy: Runtime[];
  bundledInPlugin?: string;
  /** From sibling `.*-plugin/` manifests when the skill ships inside a plugin. */
  supportsRuntimes?: Runtime[];
  enabled: boolean;
  /**
   * Claude Code `skillOverrides` visibility (standalone skills only — plugin
   * skills follow plugin enablement). Absent = no override = `on`.
   */
  visibility?: SkillVisibility;
  /** The layer that decided `visibility` (`local > project > user`). */
  visibilitySource?: VisibilitySource;
  /** Claude Code per-skill usage (from `~/.claude.json` `skillUsage`) — CC only. */
  usageCount?: number;
  lastUsedAt?: number;
  /**
   * Merged-away duplicate physical paths (dedup bookkeeping; never includes
   * `provider.path`). Internal: stripped from bulk JSON, surfaced via `show`.
   */
  copies?: SkillCopy[];
  scope: Scope;
}

export interface PluginRecord {
  id: string;
  name: string;
  /** From the plugin's `.claude-plugin/plugin.json` manifest, when present. */
  description?: string;
  marketplace: string;
  marketplaceRepo?: string;
  version: string;
  scope: 'user' | 'project';
  /** Present only when `scope === 'project'`. */
  projectPath?: string;
  enabled: boolean;
  provides: {
    skills: string[];
    commands: string[];
    agents: string[];
    mcpServers: string[];
    hooks?: string[];
  };
  /** Which `.*-plugin/` sibling manifests exist (info only). */
  supportsRuntimes: Runtime[];
  /** The runtime whose config declares this plugin (set by the engine). */
  runtime?: Runtime;
  /**
   * Set on a per-folder record that exists to surface an `enabledPlugins`
   * override of an inherited (user-scope) plugin — the settings layer that
   * flipped it (`local > project`). `enabled` reflects the override.
   */
  override?: 'project' | 'local';
}

export interface McpRecord {
  name: string;
  transport: McpTransport;
  provider: Provider;
  scope: Scope;
  enabled: boolean;
  /** The runtime whose config declares this server (set by the engine). */
  runtime?: Runtime;
}

export interface Bucket {
  skills: SkillRecord[];
  plugins: PluginRecord[];
  mcp: McpRecord[];
}

/** Pure-fs git identity of a checkout (computed in the scan; consumed by renderers). */
export interface GitLink {
  /** Root of the checkout containing the path (the worktree root for worktrees). */
  repoRoot: string;
  isWorktree: boolean;
  /** Main checkout root when this is a linked worktree. */
  mainCheckout?: string;
}

export interface FolderReport {
  path: string;
  /** Top-level grouping area, e.g. `Developer/Projects`. */
  group: string;
  runtimes: Runtime[];
  global: Bucket;
  projectScoped: Bucket;
  local: Bucket;
  effective: Bucket;
  /** git identity of this folder: null when it is not inside any checkout. */
  git: GitLink | null;
}

export interface Warning {
  path: string;
  reason: string;
}

export interface Inventory {
  generatedAt: string;
  homeRoot: string;
  runtimesDetected: Runtime[];
  warnings: Warning[];
  global: Bucket;
  folders: FolderReport[];
}

export function emptyBucket(): Bucket {
  return { skills: [], plugins: [], mcp: [] };
}
