export class OfflineReadOnlyError extends Error {
  constructor() {
    super('Cần có mạng để lưu thay đổi. App đang ở chế độ chỉ xem.')
    this.name = 'OfflineReadOnlyError'
  }
}

/** Chi cho phep ghi khi co mang — offline chi xem cache tren may. */
export function assertCanMutate(): void {
  if (!navigator.onLine) throw new OfflineReadOnlyError()
}

export function isReadOnlyMode(): boolean {
  return !navigator.onLine
}
