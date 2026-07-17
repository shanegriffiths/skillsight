// HEADER_BOX_HEIGHT is the row budget every scrollable view subtracts to size
// its list. If it undercounts the header's real rendered height, the undercount
// eats each view's SCREEN_RESERVE and a full-height list lands at exactly the
// terminal height — Ink's fullscreen clearTerminal threshold — which flickers on
// scroll (worst on the Leaderboard, the tab most likely to overflow). This pins
// the constant to the box's real height with the ANSI-Shadow art visible.
import { createElement as h } from 'react';
import { EventEmitter } from 'node:events';
import { render } from 'ink';
import { describe, it, expect } from 'vitest';
import { HeaderBox, HEADER_BOX_HEIGHT } from '../src/render/ink/HeaderBox.js';
import { emptyBucket, type Inventory } from '../src/types.js';

// A stdout stub big enough (cols >= MIN_ART_COLS, rows >= MIN_ART_ROWS) that the
// wordmark art renders — the "art visible" case HEADER_BOX_HEIGHT estimates.
class SizedStdout extends EventEmitter {
  get columns() {
    return 120;
  }
  get rows() {
    return 50;
  }
  lastFrame = '';
  write = (frame: string) => {
    this.lastFrame = frame;
  };
}

const inv: Inventory = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  homeRoot: '/home/tester',
  runtimesDetected: [],
  warnings: [],
  global: emptyBucket(),
  folders: [],
};

describe('header box height budget', () => {
  it('HEADER_BOX_HEIGHT equals the real rendered header height (art visible)', () => {
    const stdout = new SizedStdout();
    const { unmount } = render(
      h(HeaderBox, { inv, status: 'idle', tab: 'leaderboard', controls: 'hints go here' }),
      // debug:true makes Ink write the full plain frame each render (no cursor
      // escapes), so lastFrame is the complete box — matching ink-testing-library.
      { stdout: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false },
    );
    const frame = stdout.lastFrame.replace(/\n$/, ''); // drop one trailing newline if present
    unmount();
    const renderedRows = frame.split('\n').length;
    expect(renderedRows).toBe(HEADER_BOX_HEIGHT);
  });
});
