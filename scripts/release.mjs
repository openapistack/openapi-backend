#!/usr/bin/env node
// Release notes and CHANGELOG tooling for .github/workflows/release.yml. No dependencies, first-party only.
//
//   node scripts/release.mjs context <tag> <out-dir>
//     Collects the commits and pull requests since the previous release into <out-dir>/context.json.
//   node scripts/release.mjs finalize <context-dir> <ai-notes-file> <out-dir>
//     Validates the AI-drafted notes (falls back to a plain commit list), writes <out-dir>/release-notes.md
//     and inserts the entry into ./CHANGELOG.md.
//
// Everything in context.json except the git metadata comes from pull request authors and is untrusted.
// The AI draft is treated the same way: it must pass validateNotes() before it is published.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const PACKAGE = 'openapi-backend';
const CHANGELOG = 'CHANGELOG.md';
const CHANGELOG_HEADER = `# Changelog

All notable changes to openapi-backend. This project follows [Semantic Versioning](https://semver.org).
`;
const SECTIONS = ['Breaking changes', 'Security', 'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Dependencies'];
const MAX_NOTES_LENGTH = 15000;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const parseVersion = (tag) => {
  const m = SEMVER.exec(tag);
  return m && { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] };
};

export const compareVersions = (a, b) => {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) {
    if (va[k] !== vb[k]) return va[k] - vb[k];
  }
  if (va.pre === vb.pre) return 0;
  if (!va.pre) return 1;
  if (!vb.pre) return -1;
  return va.pre.localeCompare(vb.pre, 'en', { numeric: true });
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max)}\n[truncated]` : text);

const cleanBody = (text) =>
  truncate(
    (text || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    2000,
  );

// Version commits from `npm version`, and the bot commits this pipeline and sbom.yml push to main.
const isNoise = (commit) =>
  /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(commit.subject) ||
  /^chore: (update SBOM and third party notices|changelog for )/.test(commit.subject);

async function fetchPull(repository, sha) {
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}/pulls`, { headers });
  if (!res.ok) {
    console.warn(`::warning::Could not look up the pull request for ${sha}: HTTP ${res.status}`);
    return null;
  }
  const pull = (await res.json()).find((p) => p.merged_at && p.base?.repo?.full_name === repository);
  if (!pull) return null;
  const bot = pull.user?.type === 'Bot';
  return {
    number: pull.number,
    title: pull.title,
    author: pull.user?.login,
    bot,
    labels: (pull.labels || []).map((l) => l.name),
    // Bot bodies (Dependabot) are pages of upstream release notes. The title says enough.
    body: bot ? '' : cleanBody(pull.body),
  };
}

// Runtime-relevant package.json fields that changed between two tags, as { field: { from, to } }.
function packageJsonChanges(from, to) {
  const read = (ref) => JSON.parse(git('show', `${ref}:package.json`));
  const [a, b] = [read(from), read(to)];
  const changes = {};
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'engines']) {
    for (const name of new Set([...Object.keys(a[field] || {}), ...Object.keys(b[field] || {})])) {
      const [before, after] = [a[field]?.[name] ?? null, b[field]?.[name] ?? null];
      if (before !== after) changes[`${field}.${name}`] = { from: before, to: after };
    }
  }
  return changes;
}

// The context is passed to the model as a command-line argument, which Linux caps at 128 KiB.
const MAX_CONTEXT_LENGTH = 90000;
function shrinkToFit(ctx) {
  const steps = [
    (c) => ((c.body = truncate(c.body, 500)), c.pull && (c.pull.body = truncate(c.pull.body, 500))),
    (c) => (c.files = c.files.slice(0, 5)),
    (c) => ((c.body = ''), c.pull && (c.pull.body = '')),
  ];
  for (const step of steps) {
    if (JSON.stringify(ctx, null, 2).length <= MAX_CONTEXT_LENGTH) return;
    ctx.commits.forEach(step);
  }
  while (JSON.stringify(ctx, null, 2).length > MAX_CONTEXT_LENGTH) ctx.commits.pop();
}

async function context(tag, outDir) {
  const version = parseVersion(tag);
  if (!version) throw new Error(`Not a release tag: ${tag}`);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is not set');
  git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);

  const tags = git('tag', '--list')
    .split('\n')
    .filter((t) => parseVersion(t));
  // A stable release covers everything since the previous stable release, prereleases included.
  const candidates = tags.filter((t) => compareVersions(t, tag) < 0 && (version.pre || !parseVersion(t).pre));
  const previousTag = candidates.sort(compareVersions).pop() || null;
  const latest = !version.pre && tags.every((t) => parseVersion(t).pre || compareVersions(t, tag) <= 0);
  const range = previousTag ? `${previousTag}..${tag}` : tag;

  const SEP = '\x1e';
  const log = git('log', '--first-parent', `--format=%H%x1f%an%x1f%s%x1f%b${SEP}`, range);
  const commits = [];
  for (const entry of log
    .split(SEP)
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [sha, authorName, subject, body] = entry.split('\x1f');
    const commit = { sha: sha.slice(0, 7), subject, authorName, body: cleanBody(body) };
    if (isNoise(commit)) continue;
    commit.files = previousTag
      ? git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean).slice(0, 40)
      : [];
    commit.pull = await fetchPull(repository, sha);
    commits.push(commit);
  }

  const ctx = {
    package: PACKAGE,
    // From package.json at both tags: maintainer-controlled, unlike everything in `commits`.
    packageJsonChanges: previousTag ? packageJsonChanges(previousTag, tag) : {},
    repository,
    tag,
    previousTag,
    date: git('for-each-ref', '--format=%(creatordate:short)', `refs/tags/${tag}`),
    prerelease: Boolean(version.pre),
    latest,
    compareUrl: previousTag
      ? `https://github.com/${repository}/compare/${previousTag}...${tag}`
      : `https://github.com/${repository}/commits/${tag}`,
    commits,
  };
  shrinkToFit(ctx);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'context.json'), `${JSON.stringify(ctx, null, 2)}\n`);
  const hasEntry = existsSync(CHANGELOG) && changelogEntry(readFileSync(CHANGELOG, 'utf8'), tag) !== null;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `has_entry=${hasEntry}\n`);
  console.log(`${tag}: ${commits.length} commits since ${previousTag || 'the beginning'}`);
}

// Every reference the notes may contain must already appear in the context.
export function allowedRefs(ctx) {
  const numbers = new Set();
  const authors = new Set();
  const shas = new Set();
  for (const c of ctx.commits) {
    shas.add(c.sha);
    for (const text of [c.subject, c.body, c.pull?.title, c.pull?.body]) {
      for (const [, n] of (text || '').matchAll(/#(\d+)\b/g)) numbers.add(n);
    }
    if (c.pull) {
      numbers.add(String(c.pull.number));
      if (!c.pull.bot && c.pull.author) authors.add(c.pull.author.toLowerCase());
    }
  }
  return {
    numbers,
    authors,
    shas,
    pulls: new Set(ctx.commits.filter((c) => c.pull).map((c) => String(c.pull.number))),
  };
}

// Returns the list of problems with an AI draft. An empty list means it can be published as is.
export function validateNotes(notes, ctx) {
  const problems = [];
  const refs = allowedRefs(ctx);
  if (!notes.trim()) problems.push('empty');
  if (notes.length > MAX_NOTES_LENGTH) problems.push(`longer than ${MAX_NOTES_LENGTH} characters`);
  // Inline code renders as text, so `Promise<void>` is fine. URLs are rejected inside it too.
  const prose = notes.replace(/`[^`\n]*`/g, '``');
  if (/<[a-z!/?]/i.test(prose)) problems.push('contains HTML or an autolink');
  if (/\]\s*[([]|^\s*\[[^\]]*\]:/m.test(prose)) problems.push('contains a markdown link or image');
  if (/\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(javascript|data|vbscript|file|mailto):/i.test(notes)) {
    problems.push('contains a URL');
  }
  if (/^\s*(```|~~~)/m.test(notes)) problems.push('contains a code block');
  for (const [, level, title] of notes.matchAll(/^(#{1,6})[ \t]+(.*)$/gm)) {
    if (level !== '###' || !SECTIONS.includes(title.trim())) problems.push(`unexpected heading "${level} ${title}"`);
  }
  for (const [, n] of notes.matchAll(/#(\d+)\b/g)) {
    if (!refs.numbers.has(n)) problems.push(`references #${n}, which is not in the release`);
  }
  return [...new Set(problems)];
}

const MENTION = /(^|[^\w`[/])@([a-z\d](?:[a-z\d-]*[a-z\d])?)(?![\w/-])/gi;

// Wraps @mentions of anyone who didn't author a pull request in this release in backticks, so nobody gets pinged.
export const neutralizeMentions = (text, refs) =>
  text.replace(MENTION, (m, pre, login) => (refs.authors.has(login.toLowerCase()) ? m : `${pre}\`@${login}\``));

const escapeMarkdown = (text) => text.replace(/[<>[\]\\`*_|]/g, (c) => `\\${c}`);

// Deterministic fallback: one line per commit, nothing interpreted.
export function fallbackNotes(ctx) {
  const refs = allowedRefs(ctx);
  const line = (c) => {
    const pr = c.pull ? ` (#${c.pull.number})` : ` (${c.sha})`;
    return `- ${neutralizeMentions(escapeMarkdown(c.pull?.title || c.subject), refs)}${pr}`;
  };
  const isDep = (c) => c.pull?.bot || /^(chore|build)\(deps(-dev)?\)|^bump /i.test(c.subject);
  const changes = ctx.commits.filter((c) => !isDep(c)).map(line);
  const deps = ctx.commits.filter(isDep).map(line);
  let out = '';
  if (changes.length) out += `### Changed\n\n${changes.join('\n')}\n\n`;
  if (deps.length) out += `### Dependencies\n\n${deps.join('\n')}\n\n`;
  return out.trim() || '_No changes since the previous release._';
}

// GitHub links #123, @user and short SHAs in release bodies by itself, but not in a committed markdown file.
export function linkify(notes, ctx) {
  const refs = allowedRefs(ctx);
  const base = `https://github.com/${ctx.repository}`;
  return notes
    .split(/(`[^`\n]*`)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/(^|[^\w[/])#(\d+)\b/g, (m, pre, n) =>
              refs.numbers.has(n) ? `${pre}[#${n}](${base}/${refs.pulls.has(n) ? 'pull' : 'issues'}/${n})` : m,
            )
            .replace(MENTION, (m, pre, login) =>
              refs.authors.has(login.toLowerCase()) ? `${pre}[@${login}](https://github.com/${login})` : m,
            )
            .replace(/(^|[^\w[/])([0-9a-f]{7})\b/g, (m, pre, sha) =>
              refs.shas.has(sha) ? `${pre}[${sha}](${base}/commit/${sha})` : m,
            ),
    )
    .join('');
}

const headingVersion = (line) => /^## \[([^\]]+)\]/.exec(line)?.[1];

export function changelogEntry(changelog, tag) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => headingVersion(l) === tag);
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

export function insertChangelogEntry(changelog, tag, entry) {
  const lines = changelog.split('\n');
  let at = lines.findIndex(
    (l) => headingVersion(l) && parseVersion(headingVersion(l)) && compareVersions(headingVersion(l), tag) < 0,
  );
  if (at === -1) at = lines.length;
  lines.splice(at, 0, ...entry.trimEnd().split('\n'), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

export function finalize(contextDir, aiNotesFile, outDir) {
  const ctx = JSON.parse(readFileSync(join(contextDir, 'context.json'), 'utf8'));
  const changelog = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : CHANGELOG_HEADER;
  const existing = changelogEntry(changelog, ctx.tag);

  let notes;
  let source;
  if (existing) {
    // Already in CHANGELOG.md (a re-run, or an entry written by hand): publish it as is.
    notes = existing;
    source = 'changelog';
  } else {
    const raw = existsSync(aiNotesFile) ? readFileSync(aiNotesFile, 'utf8').trim() : '';
    const draft = neutralizeMentions(raw, allowedRefs(ctx));
    const problems = draft ? validateNotes(draft, ctx) : ['no draft'];
    if (problems.length) {
      console.log(`::warning::AI draft rejected (${problems.join('; ')}). Using the commit list instead.`);
      notes = fallbackNotes(ctx);
      source = 'fallback';
    } else {
      notes = draft;
      source = 'ai';
    }
    const heading = `## [${ctx.tag}](${ctx.compareUrl}) - ${ctx.date}`;
    writeFileSync(CHANGELOG, insertChangelogEntry(changelog, ctx.tag, `${heading}\n\n${linkify(notes, ctx)}\n`));
  }

  const base = `https://github.com/${ctx.repository}`;
  const footer = [
    '---',
    '',
    `**Full changelog**: ${ctx.compareUrl}`,
    `**npm**: https://www.npmjs.com/package/${ctx.package}/v/${ctx.tag}`,
    '',
    `The CycloneDX SBOMs, license listings and third-party notices for this release are attached below. ` +
      `To check that the npm package was built from this tag, see [Verifying a release](${base}/blob/main/SECURITY.md#verifying-a-release).`,
  ].join('\n');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'release-notes.md'), `${notes}\n\n${footer}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `source=${source}\nlatest=${ctx.latest}\nprerelease=${ctx.prerelease}\n`);
  }
  console.log(`${ctx.tag}: notes from ${source}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'context') await context(...args);
  else if (command === 'finalize') finalize(...args);
  else {
    console.error('Usage: release.mjs context <tag> <out-dir> | finalize <context-dir> <ai-notes-file> <out-dir>');
    process.exit(1);
  }
}
