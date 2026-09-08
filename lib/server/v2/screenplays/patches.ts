/** Apply only exact, unambiguous replacements to the version the user reviewed. */
export function applyScreenplayPatches(body: string, patches: Array<{ before: string; after: string }>): string {
  let result = body;
  for (const patch of patches) {
    if (!patch.before) {
      result = result ? `${result}\n\n${patch.after}` : patch.after;
      continue;
    }
    const index = result.indexOf(patch.before);
    if (index < 0 || result.indexOf(patch.before, index + 1) >= 0) {
      throw new Error("修改位置已变化或不唯一，请重新生成修改方案。");
    }
    result = result.slice(0, index) + patch.after + result.slice(index + patch.before.length);
  }
  return result;
}
