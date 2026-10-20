import { createElement as h } from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { HeaderBox } from '../src/render/ink/HeaderBox.js';
import { emptyBucket, type Inventory } from '../src/types.js';

function inv(live: Inventory['live']): Inventory {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    homeRoot: '/h',
    runtimesDetected: [],
    warnings: [],
    global: emptyBucket(),
    folders: [],
    live,
  };
}

const base = { status: 'idle' as const, tab: 'global' as const, controls: '' };

describe('HeaderBox — connector status on the User Scope tab', () => {
  it('says connectors are being checked while the --live fetch is still running', () => {
    const { lastFrame } = render(h(HeaderBox, { ...base, inv: inv({ connectors: false }), liveStatus: 'checking' }));
    expect(lastFrame()).toContain('connectors: checking…');
    expect(lastFrame()).not.toContain('not scanned');
  });

  it('says why when the fetch failed', () => {
    const { lastFrame } = render(h(HeaderBox, { ...base, inv: inv({ connectors: false }), liveStatus: 'failed' }));
    expect(lastFrame()).toContain('connectors: check failed');
  });

  it('says not scanned when --live was never asked for', () => {
    const { lastFrame } = render(h(HeaderBox, { ...base, inv: inv({ connectors: false }) }));
    expect(lastFrame()).toContain('connectors: not scanned');
  });

  it('says nothing extra once connectors are in', () => {
    const { lastFrame } = render(h(HeaderBox, { ...base, inv: inv({ connectors: true }) }));
    expect(lastFrame()).not.toContain('connectors:');
  });
});
