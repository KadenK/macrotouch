/**
 * Run `work` and reject with `new Error(message)` if it has not settled within
 * `ms`. `onTimeout` runs first, so callers can cancel the work.
 */
export async function withTimeout<T>(
  work: () => T | PromiseLike<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.()
          reject(new Error(message))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
