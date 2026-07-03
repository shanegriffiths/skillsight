import { describe, it, expect } from 'vitest';
import { parseFrontmatter, readFrontmatterFile } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses a standard fenced block', () => {
    expect(parseFrontmatter('---\nname: a\ndescription: b\n---\nbody')).toEqual({ name: 'a', description: 'b' });
  });
  it('a ---- underline is NOT a closing fence', () => {
    // Was {name:'a'} with the lax indexOf('\n---') match — the block is actually unterminated.
    expect(parseFrontmatter('---\nname: a\n----\nbody')).toEqual({});
  });
  it('accepts a fence at EOF with no trailing newline', () => {
    expect(parseFrontmatter('---\nname: a\n---')).toEqual({ name: 'a' });
  });
  it('accepts CRLF line endings', () => {
    expect(parseFrontmatter('---\r\nname: a\r\n---\r\nbody')).toEqual({ name: 'a' });
  });
  it('tolerates absence/malformation: {} fallbacks', () => {
    expect(parseFrontmatter('no fence at all')).toEqual({});
    expect(parseFrontmatter('---\nnever closed')).toEqual({});
    expect(parseFrontmatter('---\n[not: valid: yaml\n---\nbody')).toEqual({});
  });
  it('readFrontmatterFile returns {} for a missing file', () => {
    expect(readFrontmatterFile('/nonexistent/SKILL.md')).toEqual({});
  });
});
