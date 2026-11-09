import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
const current = path.join(root, 'dist');
const legacy = path.join(root, '.release', 'legacy', 'dist');
const output = path.resolve(root, '.release', 'site');
const archives = release.archives ?? [];
assert(Array.isArray(archives));
const frozen = [release.legacy, ...archives];
assert(/^v\d+$/.test(release.current));
for (const version of frozen) {
  assert(/^v\d+$/.test(version.version));
  assert(/^[0-9a-f]{40}$/.test(version.commit));
}
assert.equal(new Set([release.current, ...frozen.map(version => version.version)]).size, frozen.length + 1);
const sources = new Map(frozen.map(version => [version.version,
  version === release.legacy ? legacy : path.join(root, '.release', version.version, 'dist')]));
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert(/^[0-9a-f]{40}$/.test(commit));
// Refuse to clean any location other than this generated staging directory.
assert.equal(output, path.join(path.resolve(root), '.release', 'site'));
// Check every frozen build before replacing the previously assembled website.
await Promise.all([current, path.join(current, 'en'), path.join(current, 'cn'), ...sources.values()]
  .map(source => readFile(path.join(source, 'index.html'))));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(legacy, output, { recursive: true });
for (const [version, source] of sources) {
  await cp(source, path.join(output, version), { recursive: true });
}
await cp(current, path.join(output, release.current), { recursive: true });
await writeFile(path.join(output, release.current, 'index.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>建筑竞标实验室</title>
<script>location.replace('./cn/' + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0;url=./cn/"><a href="./cn/">进入中文版</a></html>\n`);
// On case-insensitive filesystems the uppercase URL already serves the English entry.
const englishAlias = `${release.current.toUpperCase()}/en`;
if (!existsSync(path.join(output, englishAlias))) {
  await mkdir(path.join(output, englishAlias), { recursive: true });
  const english = await readFile(path.join(current, 'en', 'index.html'), 'utf8');
  await writeFile(path.join(output, englishAlias, 'index.html'),
    english.replace('<head>', `<head>\n    <base href="../../${release.current}/en/">`));
}
const currentVersion = { version: release.current, commit, name: release.name,
  locales: { en: `${release.current}/en/`, cn: `${release.current}/cn/` } };
const legacyVersion = { version: release.legacy.version, commit: release.legacy.commit };
const archiveVersions = archives.map(({ version, commit, name }) => ({ version, commit, name }));
const versions = [currentVersion, ...archiveVersions, legacyVersion];
for (const [folder, version] of [['', legacyVersion], ...versions.map(version => [version.version, version])]) {
  await writeFile(path.join(output, folder, 'version.json'), JSON.stringify(version, null, 2) + '\n');
}
for (const [locale, folder] of Object.entries(currentVersion.locales)) {
  await writeFile(path.join(output, folder, 'version.json'), JSON.stringify({ ...currentVersion, locale }, null, 2) + '\n');
}
if (!existsSync(path.join(output, englishAlias, 'version.json'))) {
  await cp(path.join(output, currentVersion.locales.en, 'version.json'), path.join(output, englishAlias, 'version.json'));
}
await writeFile(path.join(output, 'versions.json'), JSON.stringify({
  current: release.current,
  versions: versions.map(version => ({ ...version, path: `${version.version}/` })),
  root: release.legacy.version,
}, null, 2) + '\n');
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Pages ready: / and /${release.legacy.version}/ retain ${release.legacy.commit.slice(0, 7)}; /${release.current}/ serves ${commit.slice(0, 7)}.`);
for (const version of archiveVersions) console.log(`/${version.version}/ retains ${version.commit.slice(0, 7)}.`);
