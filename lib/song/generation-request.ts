const lyricLanguages = [
  ["Bilingual", "中英双语|中英混合|双语|bilingual"],
  ["Chinese", "中文|汉语|普通话|国语|Chinese|Mandarin"],
  ["English", "英文|英语|English"],
  ["Spanish", "西班牙语|西语|Spanish"],
  ["Japanese", "日语|日文|Japanese"],
  ["Korean", "韩语|韩文|Korean"],
  ["French", "法语|法文|French"],
  ["Cantonese", "粤语|广东话|Cantonese"],
] as const;

function requestedLyricLanguage(content: string) {
  const clauses = content.split(/[，。；,;\n]/);
  let result: string | undefined;
  for (const clause of clauses) {
    // References and exclusions are not requests to change the lyric language.
    if (/参考|借鉴|不要|别用|不需要|不想|reference|avoid|do not|don't/i.test(clause)) continue;
    for (const [language, names] of lyricLanguages) {
      const directRequest = new RegExp(`(?:${names})(?:的)?\\s*(?:歌词|歌|lyrics|song)|(?:歌词|lyrics|sing|写|用|要|改成|换成|language)[^。；;]{0,24}(?:${names})`, "i");
      if (directRequest.test(clause)) { result = language; break; }
    }
  }
  return result;
}

/** Build the request synchronously so pending input never depends on a React render. */
export function prepareSongGeneration<T extends { outputLanguage: string; concept: string }>(
  form: T,
  notes: string,
  messages: Array<{ role: string; content: string }>,
  pendingInput: string,
) {
  const instruction = pendingInput.trim();
  const legacyUserNotes = [...notes.matchAll(/(?:^|\n\n)USER:\n([\s\S]*?)(?=\n\n(?:USER|AI):\n|$)/g)].map((match) => match[1]);
  const userInputs = [...legacyUserNotes, ...messages.filter((message) => message.role === "user").map((message) => message.content), instruction];
  let outputLanguage = form.outputLanguage;
  for (const content of userInputs) outputLanguage = requestedLyricLanguage(content) || outputLanguage;
  return {
    form: { ...form, outputLanguage, concept: form.concept.trim() ? form.concept : instruction },
    notes: instruction ? `${notes.trim()}${notes.trim() ? "\n\n" : ""}USER:\n${instruction}` : notes,
    instruction,
  };
}
