/** Bound bootstrap waits, including SDK promises that do not accept AbortSignal. */
export async function withTimeout<T>(operation: PromiseLike<T>, milliseconds: number, message = '请求超时，请重试。'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
