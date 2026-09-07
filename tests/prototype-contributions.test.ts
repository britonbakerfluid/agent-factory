import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchContributions } from '../client/prototypes/factory25dContributions';
import { createNameTag } from '../client/prototypes/factory25dLabels';
import { CONTRIBUTION_BRANCH, CONTRIBUTION_REPOSITORY } from '../shared/factory-contributions';
import { CONTRIBUTION_SEED } from '../shared/factory-contribution-seed';

const board = vi.hoisted(() => ({ preview: false, host: 'https://factory.example' }));
vi.mock('../client/prototypes/factory25dBoardData', () => ({
  isControlPreview: () => board.preview,
  factoryHost: () => board.host,
}));

const mike = CONTRIBUTION_SEED.find(record => record.githubLogin === 'tingeym')!;
const newer = { ...mike, mergedPullRequests: 543, checkedAt: mike.checkedAt + 1000 };
const snapshot = (contributors: unknown = [newer]) => ({
  repository: CONTRIBUTION_REPOSITORY, baseBranch: CONTRIBUTION_BRANCH, refresh: 'configured', contributors,
});
const response = (body: unknown) => ({ ok: true, json: async () => body });
const watchers: ReturnType<typeof watchContributions>[] = [];
const watch = (changed = vi.fn()) => {
  const watcher = watchContributions(changed);
  watchers.push(watcher);
  return { watcher, changed };
};

beforeEach(() => {
  vi.useFakeTimers();
  board.preview = false; board.host = 'https://factory.example';
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('location', { origin: 'https://factory.example' });
});
afterEach(() => {
  watchers.splice(0).forEach(watcher => watcher.dispose());
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe('contribution roster refresh', () => {
  it('shares one request across every nameplate, then accepts only newer verified records', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(snapshot()))
      .mockResolvedValueOnce(response(snapshot([{ ...newer, mergedPullRequests: 0 }])))
      .mockResolvedValueOnce(response(snapshot([{ ...mike, checkedAt: mike.checkedAt - 1 }])))
      .mockResolvedValueOnce(response(snapshot([{ ...newer, mergedPullRequests: 544, checkedAt: newer.checkedAt + 1 }])));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    expect(watcher.forUser('michaeltingey')).toEqual(mike);
    for (let index = 0; index < 30; index++) watcher.forUser('michaeltingey');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/contributions', expect.objectContaining({
      credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal),
    }));
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(watcher.forUser('a task about michaeltingey')).toBeUndefined();
    expect(watcher.forUser('unknown')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(changed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(watcher.forUser('michaeltingey')?.mergedPullRequests).toBe(544);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('retains verified totals through unavailable, incomplete, malformed, and duplicate snapshots', async () => {
    const bodies = [null, {}, snapshot(undefined), snapshot([]), snapshot({}),
      { ...snapshot(), repository: 'someone/another-repo' },
      { ...snapshot(), baseBranch: 'develop' },
      snapshot([{ ...newer, mergedPullRequests: '999' }]),
      snapshot([{ ...newer, checkedAt: -1 }]),
      snapshot([newer, { ...newer, githubLogin: 'TINGEYM', mergedPullRequests: 999 }]),
    ];
    // Explicitly omit the contributors field as an incomplete response.
    delete (bodies[2] as Partial<ReturnType<typeof snapshot>>).contributors;
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } });
    bodies.forEach(body => fetcher.mockResolvedValueOnce(response(body)));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < bodies.length + 2; index++) {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(watcher.forUser('michaeltingey')).toEqual(mike);
    }
    expect(changed).not.toHaveBeenCalled();
  });

  it('updates a valid contributor in a partial roster without deleting missing contributors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(snapshot([newer, { githubLogin: 'bad' }]))));
    const { watcher } = watch();
    const jonathan = watcher.forUser('jonathanvergara');
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(watcher.forUser('jonathanvergara')).toEqual(jonathan);
  });

  it('skips hidden pages and avoids overlapping requests when visibility changes repeatedly', async () => {
    Object.assign(document, { hidden: true });
    let receive!: (value: ReturnType<typeof response>) => void;
    const fetcher = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { receive = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetcher).not.toHaveBeenCalled();
    Object.assign(document, { hidden: false });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    receive(response(snapshot()));
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('aborts in-flight reads and prevents callbacks, interval reads, and visibility reads after disposal', async () => {
    let receive!: (value: ReturnType<typeof response>) => void;
    const fetcher = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { receive = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    watcher.dispose(); watcher.dispose();
    expect(signal.aborted).toBe(true);
    receive(response(snapshot()));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(watcher.forUser('michaeltingey')).toEqual(mike);
  });

  it('cancels a slow request after eight seconds and can recover at the next refresh', async () => {
    const fetcher = vi.fn().mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })).mockResolvedValueOnce(response(snapshot()));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(8000);
    expect(signal.aborted).toBe(true);
    expect(watcher.forUser('michaeltingey')).toEqual(mike);
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 8000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('uses bundled verified totals in isolated previews without contacting the old live server', async () => {
    vi.stubEnv('DEV', true);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    board.preview = true;
    const preview = watch();
    board.preview = false; board.host = 'https://old-production.example';
    const isolated = watch();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(preview.watcher.forUser('michaeltingey')).toEqual(mike);
    expect(isolated.watcher.forUser('michaeltingey')).toEqual(mike);
  });
});

// The scene's DOM tests use small EventTarget-based doubles, avoiding a browser dependency.
class Element extends EventTarget {
  className = ''; textContent = ''; hidden = false; id = ''; type = ''; value = 0; max = 0;
  parent?: Element;
  children: Element[] = [];
  attributes = new Map<string, string>();
  append(...children: Element[]) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap(child => [...(child.className === selector.slice(1) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
}

describe('contribution nameplate', () => {
  it('keeps levels inside hover/focus/tap details while preserving task details and unknown states', () => {
    const host = new Element();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { createElement: () => new Element() }));
    const label = createNameTag('Mike', true, host as unknown as HTMLElement);
    const badge = host.querySelectorAll('.agent-level')[0];
    const contributions = host.querySelectorAll('.agent-contributions')[0];
    const button = host.querySelectorAll('.agent-name')[0], details = host.querySelectorAll('.agent-details')[0];
    expect(badge.hidden).toBe(true); expect(contributions.hidden).toBe(true);
    label.setContribution(mike);
    expect(badge.hidden).toBe(false); expect(badge.textContent).toBe('LV 33');
    expect(badge.attributes.get('aria-label')).toBe('level 33');
    expect(button.querySelectorAll('.agent-level')).toHaveLength(0);
    expect(details.querySelectorAll('.agent-level')).toEqual([badge]);
    expect(details.hidden).toBe(true);
    label.element.dispatchEvent(new Event('pointerenter')); expect(details.hidden).toBe(false);
    label.element.dispatchEvent(new Event('pointerleave')); expect(details.hidden).toBe(true);
    button.dispatchEvent(new Event('focus')); expect(details.hidden).toBe(false);
    button.dispatchEvent(new Event('blur')); expect(details.hidden).toBe(true);
    button.dispatchEvent(new Event('click')); expect(details.hidden).toBe(false);
    const [total, progress, next, provenance] = contributions.children;
    expect(total.textContent).toBe('542 PRs merged into fluid/main');
    expect(progress.value).toBe(14); expect(progress.max).toBe(33);
    expect(progress.attributes.get('aria-label')).toBe('Level 33 progress: 14 of 33 PRs');
    expect(next.textContent).toBe('19 PRs to level 34');
    expect(provenance.textContent).toContain('@tingeym · checked');
    label.setDetails('Refactor checkout', 'writing code', 'fluid-mono');
    expect(host.querySelectorAll('.agent-name-text')[0].textContent).toBe('Refactor checkout');
    expect(badge.textContent).toBe('LV 33');
    expect(host.querySelectorAll('.agent-activity')[0].textContent).toBe('writing code');
    label.setContribution({ ...mike, mergedPullRequests: 0 });
    expect(badge.textContent).toBe('LV 1'); expect(badge.hidden).toBe(false);
    expect(next.textContent).toBe('1 PR to level 2');
    label.setContribution(undefined);
    expect(badge.hidden).toBe(true); expect(badge.textContent).toBe(''); expect(contributions.hidden).toBe(true);
    label.dispose(); expect(host.children).toHaveLength(0);
  });
});
