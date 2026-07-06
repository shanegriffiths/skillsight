/**
 * Optional Nerd Font glyphs for the dashboard. These are private-use-area
 * codepoints that only render with a patched "Nerd Font" in the terminal —
 * every recent `*-Nerd-Font` build ships them, and each occupies a single cell
 * (so, unlike emoji, they don't disturb the column padding). On a plain font
 * they'd show as tofu boxes, so `SKILLSIGHT_ICONS=off` (or `0`/`false`/`none`)
 * falls back to no glyphs and the plain `path` label.
 *
 * Kept tiny and dependency-free; resolved once from the environment at import,
 * the same static-module pattern as theme.ts.
 */
export interface Icons {
  /** Whether glyphs are active (drives text fallbacks elsewhere). */
  enabled: boolean;
  /** A folder, shown beside every project row and as the `path` label. */
  folder: string;
  /** A git branch, shown beside the synthetic `worktrees` group. */
  worktrees: string;
}

const NERD: Icons = {
  enabled: true,
  folder: '', // nf-fa-folder
  worktrees: '', // nf-dev-git_branch
};

const NONE: Icons = { enabled: false, folder: '', worktrees: '' };

const OFF = new Set(['off', '0', 'false', 'none', 'no']);

/** Resolve the icon set from the environment (pure; tested directly). */
export function resolveIcons(env: NodeJS.ProcessEnv = process.env): Icons {
  return OFF.has((env.SKILLSIGHT_ICONS ?? '').toLowerCase()) ? NONE : NERD;
}

export const icons = resolveIcons();
