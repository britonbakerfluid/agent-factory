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
  repository: CONTRIBUTION_REPOSITORY, baseBranch: CONTRIBUTION_BRANCH, refresh: 'configured', contributors, identities: [{ githubLogin: 'tingeym', factoryUsernames: ['michaeltingey'] }],
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
  it('starts without bundled totals and uses the deployment roster', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(snapshot()));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    expect(watcher.forUser('michaeltingey')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    expect(watcher.forUser('a task about michaeltingey')).toBeUndefined();
    expect(changed).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/contributions', expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
  });

  it('retains the last verified totals on failures and refuses duplicate or older records', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(snapshot()))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response(snapshot([{ ...mike, checkedAt: 1 }])))
      .mockResolvedValueOnce(response(snapshot([newer, { ...newer, githubLogin: 'TINGEYM' }])));
    vi.stubGlobal('fetch', fetcher);
    const { watcher } = watch();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
  });

  it('clears previous tenant totals and aliases when scope changes, even for the same GitHub login', async () => {
    const alternate = { repository: 'another/repository', baseBranch: 'develop',
      identities: [{ githubLogin: 'tingeym', factoryUsernames: ['New Alias'] }],
      contributors: [{ ...mike, mergedPullRequests: 2, checkedAt: 1000 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(snapshot())).mockResolvedValueOnce(response(alternate)));
    const { watcher } = watch();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(watcher.forUser('michaeltingey')).toBeUndefined();
    expect(watcher.forUser('New Alias')?.mergedPullRequests).toBe(2);
  });

  it('clears totals when integration is disabled and rejects ambiguous aliases', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(snapshot()))
      .mockResolvedValueOnce(response({ ...snapshot(), identities: [
        { githubLogin: 'one', factoryUsernames: ['Same'] }, { githubLogin: 'two', factoryUsernames: ['same'] },
      ] }))
      .mockResolvedValueOnce(response({ repository: '', baseBranch: 'main', identities: [], contributors: [], refresh: 'unconfigured' })));
    const { watcher } = watch();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(watcher.forUser('michaeltingey')).toEqual(newer);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(watcher.forUser('michaeltingey')).toBeUndefined();
  });

  it('skips hidden pages and cancels requests on timeout or disposal', async () => {
    Object.assign(document, { hidden: true });
    const fetcher = vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const { watcher, changed } = watch();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetcher).not.toHaveBeenCalled();
    Object.assign(document, { hidden: false });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
    document.dispatchEvent(new Event('visibilitychange'));
    watcher.dispose();
    expect(fetcher.mock.calls[1][1].signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps isolated previews empty without contacting another deployment', async () => {
    vi.stubEnv('DEV', true);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    board.preview = true;
    const preview = watch();
    board.preview = false; board.host = 'https://old-production.example';
    const isolated = watch();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(preview.watcher.forUser('michaeltingey')).toBeUndefined();
    expect(isolated.watcher.forUser('michaeltingey')).toBeUndefined();
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
    expect(total.textContent).toBe('542 PRs merged');
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
