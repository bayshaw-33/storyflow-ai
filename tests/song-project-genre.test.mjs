import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, normalizeStoredProject } from '../lib/projects.ts';

test('new song projects do not inherit the short-drama genre default', () => {
  assert.equal(createProject({ workflowType: 'song' }).genre, '');
});

test('loading a song without a genre leaves both genre and story genre empty', () => {
  for (const genre of [undefined, '', '   ']) {
    const project = normalizeStoredProject({ workflowType: 'song', genre });
    assert.equal(project.genre, '');
    assert.equal(project.storyBible.genreType, '');
  }
});

test('explicit song genres are preserved and drama defaults remain unchanged', () => {
  for (const genre of ['Indie Pop', '民谣', 'Hidden Heiress', '逆袭复仇']) {
    assert.equal(normalizeStoredProject({ workflowType: 'song', genre }).genre, genre);
  }
  assert.equal(normalizeStoredProject({ workflowType: 'creation' }).genre, '逆袭复仇');
  assert.equal(createProject().genre, '逆袭复仇');
});
