import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

test('all 287 art exports match the manifest, with present masters and no path escape', async () => {
  const root = resolve('.');
  const manifest = JSON.parse(await readFile('design/asset-manifest.json', 'utf8'));
  assert.equal(manifest.graphicsBeforeApplicationCode, true);
  assert.equal(manifest.assets.length, 287);
  assert.equal(manifest.assets.filter((asset: { usage: string }) => asset.usage === 'production').length, 280);
  for (const asset of manifest.assets) {
    for (const name of [asset.exportFile, asset.sourceFile]) {
      const absolute = resolve(root, name); assert.ok(absolute.startsWith(root + sep), name);
      assert.ok((await stat(absolute)).isFile(), name);
    }
    const bytes = await readFile(asset.exportFile);
    assert.ok(bytes.length > 0, asset.id);
    assert.equal(bytes.length, asset.bytes, asset.id + ' size');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.id + ' hash');
    if (asset.usage === 'production') assert.equal(asset.exportFile, 'public' + asset.path);
  }
});
