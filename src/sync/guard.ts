let applyingRemote = 0

export function isApplyingRemote(): boolean {
  return applyingRemote > 0
}

export async function withApplyingRemote<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemote++
  try {
    return await fn()
  } finally {
    applyingRemote--
  }
}
