export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function trimPromptBytes(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  const input = value.trim();
  if (encoder.encode(input).length <= maxBytes) return input;

  let output = "";
  let outputBytes = 0;
  for (const character of input) {
    const characterBytes = encoder.encode(character).length;
    if (outputBytes + characterBytes > maxBytes) break;
    output += character;
    outputBytes += characterBytes;
  }
  return output.trimEnd();
}
