import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArtGeneration, artChatFallback } from '../lib/art/chat-intent.ts';

test('generation plan validates prompt, kinds and existing asset ids', () => {
  assert.equal(normalizeArtGeneration({ prompt: '' }, []), null);
  assert.deepEqual(normalizeArtGeneration({ prompt: '雨夜', assetId: 'someone-else', kind: 'invalid' }, []), { prompt: '雨夜', assetId: undefined, kind: 'character', name: '聊天生成' });
  assert.equal(normalizeArtGeneration({ prompt: '雨夜', assetId: 'mine' }, [{ id: 'mine' }]).assetId, 'mine');
});
test('fallback honours explicit paid generation but never pretends generation succeeded', () => {
  assert.match(artChatFallback('参考这张图生成雨夜照片').generation.prompt, /雨夜/);
  assert.equal(artChatFallback('帮我解释一下角色的设计').generation, null);
  assert.equal(artChatFallback('不要生成图片，先聊聊').generation, null);
  assert.equal(artChatFallback('生成一个角色图片提示词').generation, null);
  assert.equal(artChatFallback('generate an image prompt').generation, null);
  assert.doesNotMatch(artChatFallback('生成一个场景图').assistantText, /已生成/);
});
