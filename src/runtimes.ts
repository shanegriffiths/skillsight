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
const HUB = { homeDir: '.agents', universal: true } as const;

export const KNOWN_RUNTIMES: RuntimeDef[] = [
  // ---- deep adapters ----
  { id: 'claude-code', homeDir: '.claude', homeEnv: 'CLAUDE_CONFIG_DIR', deep: true },
  { id: 'codex', homeDir: '.codex', homeEnv: 'CODEX_HOME', universal: true, deep: true },
  { id: 'hermes-agent', homeDir: '.hermes', homeEnv: 'HERMES_HOME', deep: true },
  { id: 'gemini-cli', homeDir: '.gemini', universal: true, deep: true },
  { id: 'cursor', homeDir: '.cursor', universal: true, deep: true },
  { id: 'opencode', homeDir: 'opencode', base: 'config', universal: true, deep: true },

  // ---- hub-direct universal agents ----
  { id: 'cline', ...HUB },
  { id: 'dexto', ...HUB },
  { id: 'firebender', ...HUB },
  { id: 'kimi-code-cli', ...HUB },
  { id: 'loaf', ...HUB },
  { id: 'warp', ...HUB },
  { id: 'zed', ...HUB },

  // ---- other universal agents (own global dir, project uses the hub) ----
  { id: 'amp', homeDir: 'agents', base: 'config', universal: true },
  { id: 'replit', homeDir: 'agents', base: 'config', universal: true },
  { id: 'antigravity', homeDir: '.gemini', skillsSub: 'antigravity/skills', universal: true },
  { id: 'antigravity-cli', homeDir: '.gemini', skillsSub: 'antigravity-cli/skills', universal: true },
  { id: 'deepagents', homeDir: '.deepagents', skillsSub: 'agent/skills', universal: true },
  { id: 'github-copilot', homeDir: '.copilot', universal: true },

  // ---- non-universal agents (own global + project skills dirs) ----
  { id: 'adal', homeDir: '.adal' },
  { id: 'aider-desk', homeDir: '.aider-desk' },
  { id: 'astrbot', homeDir: '.astrbot', skillsSub: 'data/skills' },
  { id: 'augment', homeDir: '.augment' },
  { id: 'autohand-code', homeDir: '.autohand', homeEnv: 'AUTOHAND_HOME' },
  { id: 'bob', homeDir: '.bob' },
  { id: 'codearts-agent', homeDir: '.codeartsdoer' },
  { id: 'codebuddy', homeDir: '.codebuddy' },
  { id: 'codemaker', homeDir: '.codemaker' },
  { id: 'codestudio', homeDir: '.codestudio' },
  { id: 'command-code', homeDir: '.commandcode' },
  { id: 'continue', homeDir: '.continue' },
  { id: 'cortex', homeDir: '.snowflake', skillsSub: 'cortex/skills' },
  { id: 'crush', homeDir: 'crush', base: 'config' },
  { id: 'devin', homeDir: 'devin', base: 'config' },
  { id: 'droid', homeDir: '.factory' },
  { id: 'forgecode', homeDir: '.forge' },
  { id: 'goose', homeDir: 'goose', base: 'config' },
  { id: 'iflow-cli', homeDir: '.iflow' },
  { id: 'inference-sh', homeDir: '.inferencesh' },
  { id: 'jazz', homeDir: '.jazz' },
  { id: 'junie', homeDir: '.junie' },
  { id: 'kilo', homeDir: '.kilocode' },
  { id: 'kiro-cli', homeDir: '.kiro' },
  { id: 'kode', homeDir: '.kode' },
  { id: 'lingma', homeDir: '.lingma' },
  { id: 'mcpjam', homeDir: '.mcpjam' },
  { id: 'mistral-vibe', homeDir: '.vibe', homeEnv: 'VIBE_HOME' },
  { id: 'moltbot', homeDir: '.moltbot' },
  { id: 'moxby', homeDir: '.moxby' },
  { id: 'mux', homeDir: '.mux' },
  { id: 'neovate', homeDir: '.neovate' },
  { id: 'ona', homeDir: '.ona' },
  { id: 'openhands', homeDir: '.openhands' },
  { id: 'pi', homeDir: '.pi', skillsSub: 'agent/skills' },
  { id: 'pochi', homeDir: '.pochi' },
  { id: 'qoder', homeDir: '.qoder' },
  { id: 'qoder-cn', homeDir: '.qoder-cn' },
  { id: 'qwen-code', homeDir: '.qwen' },
  { id: 'reasonix', homeDir: '.reasonix' },
  { id: 'roo', homeDir: '.roo' },
  { id: 'rovodev', homeDir: '.rovodev' },
  { id: 'tabnine-cli', homeDir: '.tabnine', skillsSub: 'agent/skills' },
  { id: 'terramind', homeDir: '.terramind' },
  { id: 'tinycloud', homeDir: '.tinycloud' },
  { id: 'trae', homeDir: '.trae' },
  { id: 'trae-cn', homeDir: '.trae-cn' },
  { id: 'windsurf', homeDir: '.codeium', skillsSub: 'windsurf/skills' },
  { id: 'zencoder', homeDir: '.zencoder' },
  { id: 'zenflow', homeDir: '.zencoder' },
];

export const DEEP_RUNTIMES: RuntimeDef[] = KNOWN_RUNTIMES.filter((r) => r.deep);

export function runtimeById(id: Runtime): RuntimeDef | undefined {
  return KNOWN_RUNTIMES.find((r) => r.id === id);
}
