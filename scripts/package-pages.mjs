import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
const current = path.join(root, 'dist');
const legacy = path.join(root, '.release', 'legacy', 'dist');
const output = path.resolve(root, '.release', 'site');
assert(/^v\d+$/.test(release.current));
assert(/^v\d+$/.test(release.legacy.version));
assert.notEqual(release.current, release.legacy.version);
assert(/^[0-9a-f]{40}$/.test(release.legacy.commit));
// Refuse to clean any location other than this generated staging directory.
assert.equal(output, path.join(path.resolve(root), '.release', 'site'));
await Promise.all([readFile(path.join(current, 'index.html')), readFile(path.join(legacy, 'index.html'))]);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(legacy, output, { recursive: true });
await cp(legacy, path.join(output, release.legacy.version), { recursive: true });
await cp(current, path.join(output, release.current), { recursive: true });
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const currentVersion = { version: release.current, commit, name: release.name };
const legacyVersion = { version: release.legacy.version, commit: release.legacy.commit };
for (const [folder, version] of [['', legacyVersion], [release.legacy.version, legacyVersion], [release.current, currentVersion]]) {
  await writeFile(path.join(output, folder, 'version.json'), JSON.stringify(version, null, 2) + '\n');
}
await writeFile(path.join(output, 'versions.json'), JSON.stringify({
  current: release.current,
  versions: [{ ...currentVersion, path: `${release.current}/` }, { ...legacyVersion, path: `${release.legacy.version}/` }],
  root: release.legacy.version,
}, null, 2) + '\n');
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Pages ready: / and /${release.legacy.version}/ retain ${release.legacy.commit.slice(0, 7)}; /${release.current}/ serves ${commit.slice(0, 7)}.`);
