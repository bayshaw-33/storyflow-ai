import assert from 'node:assert/strict';
import test from 'node:test';
import { lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import config from '../next.config.ts';

test('audio encoder tracing uses a real file with no symlinked parent directories', () => {
  const [included] = config.outputFileTracingIncludes['/api/audio/jobs/*/download'];
  let path = resolve(included);
  assert.equal(lstatSync(path).isFile(), true);
  while (dirname(path) !== path) {
    assert.equal(lstatSync(path).isSymbolicLink(), false, path);
    path = dirname(path);
  }
});
