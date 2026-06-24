/**
 * KNOWN_RUNTIMES — the cross-tool agent registry.
 *
 * Mirrors the authoritative map in `vercel-labs/skills` (`src/agents.ts`). A few
 * runtimes get deep adapters (`deep: true`) that parse config + plugins + MCP;
 * **every** entry participates in cheap presence-detection and reverse-symlink
 * `usedBy` scanning, so "which runtimes use this skill" is honest across the
 * whole ecosystem rather than just the handful with bespoke adapters.
 *
 * Home resolution is env-aware (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HERMES_HOME`,
 * `XDG_CONFIG_HOME`, …) so it survives relocated config dirs.
 */
import { join } from 'node:path';
import type { Runtime } from './types.js';

export interface HomeCtx {
  homeRoot: string;
  env: Record<string, string | undefined>;
}

export interface RuntimeDef {
  id: Runtime;
  /** Env var that, when set, replaces the agent's home dir entirely. */
  homeEnv?: string;
  /** Home dir relative to the base root (e.g. `.claude`, `opencode`). */
  homeDir: string;
  /** Base root for `homeDir`. `config` honors `XDG_CONFIG_HOME`. */
  base?: 'home' | 'config';
  /** Skills subpath within the home dir. Default `skills`. */
  skillsSub?: string;
  /** Project-relative skills dir (e.g. `.claude/skills` or `.agents/skills`). */
  projectSkills: string;
  /** Project skills resolve to the shared `.agents/skills` hub. */
  universal?: boolean;
  /** Has a deep adapter (not just usedBy detection). */
  deep?: boolean;
}

function xdgConfig(ctx: HomeCtx): string {
  const x = ctx.env.XDG_CONFIG_HOME?.trim();
  return x ? x : join(ctx.homeRoot, '.config');
}

/** Resolve a runtime's config home, honoring env overrides + XDG. */
export function runtimeHome(def: RuntimeDef, ctx: HomeCtx): string {
  if (def.homeEnv) {
    const v = ctx.env[def.homeEnv]?.trim();
    if (v) return v;
  }
  const base = def.base === 'config' ? xdgConfig(ctx) : ctx.homeRoot;
  return join(base, def.homeDir);
}

/** Resolve a runtime's global skills directory. */
export function globalSkillsDir(def: RuntimeDef, ctx: HomeCtx): string {
  return join(runtimeHome(def, ctx), def.skillsSub ?? 'skills');
}

/** The shared content hub (`~/.agents/skills`). */
export function sharedHubDir(ctx: HomeCtx): string {
  return join(ctx.homeRoot, '.agents', 'skills');
}

/** The shared hub lock file (`~/.agents/.skill-lock.json`). */
export function sharedLockPath(ctx: HomeCtx): string {
  return join(ctx.homeRoot, '.agents', '.skill-lock.json');
}

// Hub-direct universal agents read ~/.agents/skills as their global dir.
const HUB = { homeDir: '.agents', projectSkills: '.agents/skills', universal: true } as const;

export const KNOWN_RUNTIMES: RuntimeDef[] = [
  // ---- deep adapters ----
  { id: 'claude-code', homeDir: '.claude', homeEnv: 'CLAUDE_CONFIG_DIR', projectSkills: '.claude/skills', deep: true },
  { id: 'codex', homeDir: '.codex', homeEnv: 'CODEX_HOME', projectSkills: '.agents/skills', universal: true, deep: true },
  { id: 'hermes-agent', homeDir: '.hermes', homeEnv: 'HERMES_HOME', projectSkills: '.hermes/skills', deep: true },
  { id: 'gemini-cli', homeDir: '.gemini', projectSkills: '.agents/skills', universal: true, deep: true },
  { id: 'cursor', homeDir: '.cursor', projectSkills: '.agents/skills', universal: true, deep: true },
  { id: 'opencode', homeDir: 'opencode', base: 'config', projectSkills: '.agents/skills', universal: true, deep: true },

  // ---- hub-direct universal agents ----
  { id: 'cline', ...HUB },
  { id: 'dexto', ...HUB },
  { id: 'firebender', ...HUB },
  { id: 'kimi-code-cli', ...HUB },
  { id: 'loaf', ...HUB },
  { id: 'warp', ...HUB },
  { id: 'zed', ...HUB },

  // ---- other universal agents (own global dir, project uses the hub) ----
  { id: 'amp', homeDir: 'agents', base: 'config', projectSkills: '.agents/skills', universal: true },
  { id: 'replit', homeDir: 'agents', base: 'config', projectSkills: '.agents/skills', universal: true },
  { id: 'antigravity', homeDir: '.gemini', skillsSub: 'antigravity/skills', projectSkills: '.agents/skills', universal: true },
  { id: 'antigravity-cli', homeDir: '.gemini', skillsSub: 'antigravity-cli/skills', projectSkills: '.agents/skills', universal: true },
  { id: 'deepagents', homeDir: '.deepagents', skillsSub: 'agent/skills', projectSkills: '.agents/skills', universal: true },
  { id: 'github-copilot', homeDir: '.copilot', projectSkills: '.agents/skills', universal: true },

  // ---- non-universal agents (own global + project skills dirs) ----
  { id: 'adal', homeDir: '.adal', projectSkills: '.adal/skills' },
  { id: 'aider-desk', homeDir: '.aider-desk', projectSkills: '.aider-desk/skills' },
  { id: 'astrbot', homeDir: '.astrbot', skillsSub: 'data/skills', projectSkills: 'data/skills' },
  { id: 'augment', homeDir: '.augment', projectSkills: '.augment/skills' },
  { id: 'autohand-code', homeDir: '.autohand', homeEnv: 'AUTOHAND_HOME', projectSkills: '.autohand/skills' },
  { id: 'bob', homeDir: '.bob', projectSkills: '.bob/skills' },
  { id: 'codearts-agent', homeDir: '.codeartsdoer', projectSkills: '.codeartsdoer/skills' },
  { id: 'codebuddy', homeDir: '.codebuddy', projectSkills: '.codebuddy/skills' },
  { id: 'codemaker', homeDir: '.codemaker', projectSkills: '.codemaker/skills' },
  { id: 'codestudio', homeDir: '.codestudio', projectSkills: '.codestudio/skills' },
  { id: 'command-code', homeDir: '.commandcode', projectSkills: '.commandcode/skills' },
  { id: 'continue', homeDir: '.continue', projectSkills: '.continue/skills' },
  { id: 'cortex', homeDir: '.snowflake', skillsSub: 'cortex/skills', projectSkills: '.cortex/skills' },
  { id: 'crush', homeDir: 'crush', base: 'config', projectSkills: '.crush/skills' },
  { id: 'devin', homeDir: 'devin', base: 'config', projectSkills: '.devin/skills' },
  { id: 'droid', homeDir: '.factory', projectSkills: '.factory/skills' },
  { id: 'forgecode', homeDir: '.forge', projectSkills: '.forge/skills' },
  { id: 'goose', homeDir: 'goose', base: 'config', projectSkills: '.goose/skills' },
  { id: 'iflow-cli', homeDir: '.iflow', projectSkills: '.iflow/skills' },
  { id: 'inference-sh', homeDir: '.inferencesh', projectSkills: '.inferencesh/skills' },
  { id: 'jazz', homeDir: '.jazz', projectSkills: '.jazz/skills' },
  { id: 'junie', homeDir: '.junie', projectSkills: '.junie/skills' },
  { id: 'kilo', homeDir: '.kilocode', projectSkills: '.kilocode/skills' },
  { id: 'kiro-cli', homeDir: '.kiro', projectSkills: '.kiro/skills' },
  { id: 'kode', homeDir: '.kode', projectSkills: '.kode/skills' },
  { id: 'lingma', homeDir: '.lingma', projectSkills: '.lingma/skills' },
  { id: 'mcpjam', homeDir: '.mcpjam', projectSkills: '.mcpjam/skills' },
  { id: 'mistral-vibe', homeDir: '.vibe', homeEnv: 'VIBE_HOME', projectSkills: '.vibe/skills' },
  { id: 'moltbot', homeDir: '.moltbot', projectSkills: '.moltbot/skills' },
  { id: 'moxby', homeDir: '.moxby', projectSkills: '.moxby/skills' },
  { id: 'mux', homeDir: '.mux', projectSkills: '.mux/skills' },
  { id: 'neovate', homeDir: '.neovate', projectSkills: '.neovate/skills' },
  { id: 'ona', homeDir: '.ona', projectSkills: '.ona/skills' },
  { id: 'openhands', homeDir: '.openhands', projectSkills: '.openhands/skills' },
  { id: 'pi', homeDir: '.pi', skillsSub: 'agent/skills', projectSkills: '.pi/skills' },
  { id: 'pochi', homeDir: '.pochi', projectSkills: '.pochi/skills' },
  { id: 'qoder', homeDir: '.qoder', projectSkills: '.qoder/skills' },
  { id: 'qoder-cn', homeDir: '.qoder-cn', projectSkills: '.qoder/skills' },
  { id: 'qwen-code', homeDir: '.qwen', projectSkills: '.qwen/skills' },
  { id: 'reasonix', homeDir: '.reasonix', projectSkills: '.reasonix/skills' },
  { id: 'roo', homeDir: '.roo', projectSkills: '.roo/skills' },
  { id: 'rovodev', homeDir: '.rovodev', projectSkills: '.rovodev/skills' },
  { id: 'tabnine-cli', homeDir: '.tabnine', skillsSub: 'agent/skills', projectSkills: '.tabnine/agent/skills' },
  { id: 'terramind', homeDir: '.terramind', projectSkills: '.terramind/skills' },
  { id: 'tinycloud', homeDir: '.tinycloud', projectSkills: '.tinycloud/skills' },
  { id: 'trae', homeDir: '.trae', projectSkills: '.trae/skills' },
  { id: 'trae-cn', homeDir: '.trae-cn', projectSkills: '.trae/skills' },
  { id: 'windsurf', homeDir: '.codeium', skillsSub: 'windsurf/skills', projectSkills: '.windsurf/skills' },
  { id: 'zencoder', homeDir: '.zencoder', projectSkills: '.zencoder/skills' },
  { id: 'zenflow', homeDir: '.zencoder', projectSkills: '.zencoder/skills' },
];

export const DEEP_RUNTIMES: RuntimeDef[] = KNOWN_RUNTIMES.filter((r) => r.deep);

export function runtimeById(id: Runtime): RuntimeDef | undefined {
  return KNOWN_RUNTIMES.find((r) => r.id === id);
}
