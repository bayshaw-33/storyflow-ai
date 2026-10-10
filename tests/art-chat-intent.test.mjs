import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArtGeneration, artChatFallback, buildArtGenerationPrompt } from '../lib/art/chat-intent.ts';

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

test('final generation prompt preserves the user instruction and reference-image constraint', () => {
  const prompt = buildArtGenerationPrompt(
    '保持参考图人物的脸和红色泳装，在海边接吻，电影感夜景。',
    'Two people on a beach at night, cinematic lighting.',
    2,
  );

  assert.match(prompt, /用户本轮原始要求/);
  assert.match(prompt, /保持参考图人物的脸和红色泳装，在海边接吻，电影感夜景/);
  assert.match(prompt, /视觉执行细化/);
  assert.match(prompt, /2 张参考图/);
  assert.match(prompt, /不得忽略/);
});

test('final generation prompt does not duplicate an unchanged planner prompt', () => {
  const prompt = buildArtGenerationPrompt('生成雨夜街头人物全身照', '生成雨夜街头人物全身照', 0);
  assert.equal(prompt.match(/生成雨夜街头人物全身照/g)?.length, 1);
  assert.doesNotMatch(prompt, /参考图约束/);
});
