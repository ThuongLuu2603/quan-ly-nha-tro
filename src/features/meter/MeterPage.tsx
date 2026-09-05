import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { saveReading } from '../../data/actions'
import { activeTenancy, readingOf, readingsOfRoom } from '../../data/selectors'
import { useDataset, type Dataset } from '../../data/store'
import * as dt from '../../domain/dates'
import { roomCollectsMeteredUtilities } from '../../domain/billing'
import { compareRooms } from '../../domain/roomOrder'
import { formatMoney, formatNumber } from '../../domain/money'
import type { ID, Period, Room } from '../../domain/types'
import { Banner, Card, EmptyState, NumberInput, useToast } from '../../ui/components'
import { Page } from '../../ui/Page'

interface Draft {
  electric: number | null
  water: number | null
  /** Số đồng hồ CŨ lúc tháo nếu thay giữa kỳ, null = không thay. */
  electricReset: number | null
  /** Số đầu đồng hồ MỚI (thường 0). */
  electricNewStart: number | null
  waterReset: number | null
  waterNewStart: number | null
  /** Khung nhập thay đồng hồ đang mở (từng loại riêng). */
  changing: 'electric' | 'water' | null
}

const EMPTY_DRAFT: Draft = {
  electric: null,
  water: null,
  electricReset: null,
  electricNewStart: 0,
  waterReset: null,
  waterNewStart: 0,
  changing: null,
}

/** Ky dien nuoc can nhap: thang truoc thang phat phieu. */
function defaultUtilityPeriod(): Period {
  const now = dt.today()
  const { day } = dt.parseISO(now)
  const period = dt.periodOf(now)
  return day >= 25 ? period : dt.prevPeriod(period)
}

function baselineOf(
  data: Dataset,
  room: Room,
  utilityPeriod: Period,
): { electric: number; water: number } | null {
  const tenancy = activeTenancy(data, room.id)
  if (!tenancy) return null
  const prev = readingOf(data, room.id, dt.prevPeriod(utilityPeriod))
  if (prev && dt.periodOf(tenancy.startDate) < utilityPeriod) {
    return { electric: prev.electricEnd, water: prev.waterEnd }
  }
  return { electric: tenancy.electricStart, water: tenancy.waterStart }
}

function baselineLabel(data: Dataset, room: Room, utilityPeriod: Period): string {
  const tenancy = activeTenancy(data, room.id)
  if (!tenancy) return 'đầu kỳ'
  const prev = readingOf(data, room.id, dt.prevPeriod(utilityPeriod))
  if (!prev || dt.periodOf(tenancy.startDate) >= utilityPeriod) return 'bàn giao'
  return `lần trước (${dt.formatInvoiceMonthShort(dt.invoiceMonthForUtilityPeriod(dt.prevPeriod(utilityPeriod)))})`
}

function averageUsage(data: Dataset, roomId: ID, before: Period): number | null {
  const readings = readingsOfRoom(data, roomId).filter((r) => r.period < before)
  if (readings.length < 2) return null
  const recent = readings.slice(-4)
  const deltas: number[] = []
  for (let i = 1; i < recent.length; i++) {
    deltas.push(Math.max(0, recent[i].electricEnd - recent[i - 1].electricEnd))
  }
  if (deltas.length === 0) return null
  return deltas.reduce((a, b) => a + b, 0) / deltas.length
}

function MeterResetPanel({
  kind,
  draft,
  onPatch,
  onCancel,
  onApply,
}: {
  kind: 'electric' | 'water'
  draft: Draft
  onPatch: (patch: Partial<Draft>) => void
  onCancel: () => void
  onApply: () => void
}) {
  const isElectric = kind === 'electric'
  const label = isElectric ? 'điện' : 'nước'
  const oldValue = isElectric ? draft.electricReset : draft.waterReset
  const newStart = isElectric ? draft.electricNewStart : draft.waterNewStart

  return (
    <div
      className="meter-reset-panel"
      style={{
        margin: '0 0 12px 12px',
        padding: '10px 12px',
        borderLeft: `3px solid ${isElectric ? 'var(--warn)' : 'var(--accent)'}`,
        background: 'var(--surface-2, transparent)',
        borderRadius: 8,
      }}
    >
      <div className="tiny strong" style={{ marginBottom: 6 }}>
        Thay đồng hồ {label}
      </div>
      <div className="tiny muted" style={{ marginBottom: 8 }}>
        Nhập <strong>số đồng hồ cũ lúc tháo</strong> và <strong>số đầu đồng hồ mới</strong> (thường 0).
      </div>
      <div className="meter-row" style={{ paddingBottom: 4 }}>
        <div className="tiny muted">Cũ tháo tại</div>
        <NumberInput
          value={oldValue}
          onChange={(value) =>
            onPatch(isElectric ? { electricReset: value } : { waterReset: value })
          }
        />
        <NumberInput
          value={newStart}
          onChange={(value) =>
            onPatch(isElectric ? { electricNewStart: value } : { waterNewStart: value })
          }
        />
      </div>
      <div className="tiny muted" style={{ margin: '4px 0 8px' }}>
        Trái = số lúc tháo · Phải = số đầu đồng hồ mới
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn sm" onClick={onCancel}>
          Bỏ
        </button>
        <button className="btn primary sm" style={{ flex: 1 }} onClick={onApply}>
          Áp dụng &amp; lưu
        </button>
      </div>
    </div>
  )
}

export function MeterPage() {
  const data = useDataset()
  const { toast, toastNode } = useToast()
  const [searchParams] = useSearchParams()

  const initialInvoiceMonth = useMemo(() => {
    const fromUrl = searchParams.get('phieu')
    if (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl)) return fromUrl as Period
    return dt.invoiceMonthForUtilityPeriod(defaultUtilityPeriod())
  }, [searchParams])

  const [invoiceMonth, setInvoiceMonth] = useState<Period>(initialInvoiceMonth)
  const utilityPeriod = dt.utilityPeriodForInvoiceMonth(invoiceMonth)
  const [drafts, setDrafts] = useState<Record<ID, Draft>>({})

  useEffect(() => {
    setInvoiceMonth(initialInvoiceMonth)
  }, [initialInvoiceMonth])

  const rooms = useMemo(
    () =>
      data.rooms
        .filter((room) => roomCollectsMeteredUtilities(room) && activeTenancy(data, room.id))
        .sort(compareRooms),
    [data],
  )

  useEffect(() => {
    const next: Record<ID, Draft> = {}
    for (const room of data.rooms) {
      const reading = readingOf(data, room.id, utilityPeriod)
      next[room.id] = {
        electric: reading ? reading.electricEnd : null,
        water: reading ? reading.waterEnd : null,
        electricReset: reading?.electricReset ?? null,
        electricNewStart: reading?.electricNewStart ?? 0,
        waterReset: reading?.waterReset ?? null,
        waterNewStart: reading?.waterNewStart ?? 0,
        changing: null,
      }
    }
    setDrafts(next)
  }, [utilityPeriod, data])

  const invoiceMonths = useMemo(() => {
    const current = dt.periodOf(dt.today())
    return [dt.prevPeriod(current), current, dt.nextPeriod(current)]
  }, [])

  const patchDraft = (roomId: ID, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [roomId]: { ...(prev[roomId] ?? EMPTY_DRAFT), ...patch } }))
  }

  const commit = async (room: Room, draft: Draft) => {
    if (draft.electric === null || draft.water === null) return
    const existing = readingOf(data, room.id, utilityPeriod)
    if (
      existing &&
      existing.electricEnd === draft.electric &&
      existing.waterEnd === draft.water &&
      (existing.electricReset ?? null) === draft.electricReset &&
      (existing.electricNewStart ?? 0) === draft.electricNewStart &&
      (existing.waterReset ?? null) === draft.waterReset &&
      (existing.waterNewStart ?? 0) === draft.waterNewStart
    ) {
      return
    }
    await saveReading({
      roomId: room.id,
      period: utilityPeriod,
      electricEnd: draft.electric,
      waterEnd: draft.water,
      electricReset: draft.electricReset ?? undefined,
      electricNewStart: draft.electricReset !== null ? (draft.electricNewStart ?? 0) : undefined,
      waterReset: draft.waterReset ?? undefined,
      waterNewStart: draft.waterReset !== null ? (draft.waterNewStart ?? 0) : undefined,
    })
    toast(`Đã lưu chỉ số ${room.name}`)
  }

  const missing = rooms.filter((room) => !readingOf(data, room.id, utilityPeriod)).length

  const usageTotals = useMemo(() => {
    let totalKwh = 0
    let totalM3 = 0
    let totalAmount = 0
    let counted = 0

    for (const room of rooms) {
      const base = baselineOf(data, room, utilityPeriod)
      const draft = drafts[room.id] ?? EMPTY_DRAFT
      if (base === null || draft.electric === null || draft.water === null) continue
      // Thay dong ho: tong = (dau ky -> so dong cu luc thao) + (so dau moi -> hien tai).
      const kwh =
        draft.electricReset !== null
          ? Math.max(0, draft.electricReset - base.electric) +
            Math.max(0, draft.electric - (draft.electricNewStart ?? 0))
          : draft.electric - base.electric
      const m3 =
        draft.waterReset !== null
          ? Math.max(0, draft.waterReset - base.water) +
            Math.max(0, draft.water - (draft.waterNewStart ?? 0))
          : draft.water - base.water
      if (kwh >= 0 && m3 >= 0) {
        totalKwh += kwh
        totalM3 += m3
        totalAmount += kwh * room.electricPrice + m3 * room.waterPrice
        counted += 1
      }
    }

    return { totalKwh, totalM3, totalAmount, counted }
  }, [rooms, data, utilityPeriod, drafts])

  return (
    <Page title="Nhập điện nước" subtitle={dt.formatInvoiceMonthLabel(invoiceMonth)}>
      <Banner tone="info">
        Chọn đúng <strong>{dt.formatInvoiceMonthLabel(invoiceMonth)}</strong> rồi nhập{' '}
        <strong>số đồng hồ hiện tại</strong> (đọc hôm nay hoặc đúng ngày phát phiếu). Số{' '}
        <strong>bàn giao</strong> lúc nhận phòng không nhập ở đây.
      </Banner>

      <div className="chip-row">
        {invoiceMonths.map((m) => (
          <button
            key={m}
            className={m === invoiceMonth ? 'chip meter-chip active' : 'chip meter-chip'}
            onClick={() => setInvoiceMonth(m)}
          >
            <span className="meter-chip-label">Phiếu {dt.formatInvoiceMonthShort(m)}</span>
          </button>
        ))}
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon="meter"
          text="Không có phòng trọ nào cần nhập điện nước (phòng chỉ thu tiền nhà sẽ không hiện ở đây)."
        />
      ) : (
        <>
          {missing > 0 && (
            <Banner tone="info">
              Còn {missing} phòng chưa nhập điện nước cho {dt.formatInvoiceMonthLabel(invoiceMonth)}.
            </Banner>
          )}

          <Card flush>
            <div style={{ padding: '12px 16px' }}>
              <div className="meter-row" style={{ paddingTop: 0 }}>
                <div className="tiny muted strong">PHÒNG</div>
                <div className="tiny muted strong right">ĐIỆN MỚI</div>
                <div className="tiny muted strong right">NƯỚC MỚI</div>
              </div>

              {rooms.map((room) => {
                const base = baselineOf(data, room, utilityPeriod)
                const draft = drafts[room.id] ?? EMPTY_DRAFT
                const hasElectricReset = draft.electricReset !== null
                const hasWaterReset = draft.waterReset !== null
                const collectsElectric = room.electricPrice > 0
                const collectsWater = room.waterPrice > 0

                const kwh =
                  base !== null && draft.electric !== null
                    ? hasElectricReset
                      ? Math.max(0, (draft.electricReset ?? 0) - base.electric) +
                        Math.max(0, draft.electric - (draft.electricNewStart ?? 0))
                      : draft.electric - base.electric
                    : null
                const m3 =
                  base !== null && draft.water !== null
                    ? hasWaterReset
                      ? Math.max(0, (draft.waterReset ?? 0) - base.water) +
                        Math.max(0, draft.water - (draft.waterNewStart ?? 0))
                      : draft.water - base.water
                    : null

                const avg = averageUsage(data, room.id, utilityPeriod)

                const electricBad =
                  base !== null && draft.electric !== null
                    ? hasElectricReset
                      ? (draft.electricReset ?? 0) < base.electric ||
                        draft.electric < (draft.electricNewStart ?? 0)
                      : draft.electric < base.electric
                    : false
                const waterBad =
                  base !== null && draft.water !== null
                    ? hasWaterReset
                      ? (draft.waterReset ?? 0) < base.water || draft.water < (draft.waterNewStart ?? 0)
                      : draft.water < base.water
                    : false
                const backwards = electricBad || waterBad
                const spike = kwh !== null && avg !== null && avg > 0 && kwh > avg * 1.5

                const amount =
                  kwh !== null && m3 !== null && kwh >= 0 && m3 >= 0
                    ? kwh * room.electricPrice + m3 * room.waterPrice
                    : null

                const usageNote = [
                  hasElectricReset ? 'điện 2 đoạn' : '',
                  hasWaterReset ? 'nước 2 đoạn' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')

                const backwardsHint =
                  electricBad && waterBad
                    ? 'Số điện/nước nhỏ hơn đầu kỳ — bấm «Thay ĐH điện» hoặc «Thay ĐH nước» nếu vừa thay.'
                    : electricBad
                      ? 'Số điện nhỏ hơn đầu kỳ — bấm «Thay ĐH điện» nếu vừa thay đồng hồ.'
                      : 'Số nước nhỏ hơn đầu kỳ — bấm «Thay ĐH nước» nếu vừa thay đồng hồ.'

                return (
                  <div key={room.id}>
                    <div className="meter-row">
                      <div>
                        <div className="strong">
                          {room.name}
                          {hasElectricReset && (
                            <span className="pill accent" style={{ marginLeft: 6 }}>
                              ĐH điện mới
                            </span>
                          )}
                          {hasWaterReset && (
                            <span className="pill accent" style={{ marginLeft: 6 }}>
                              ĐH nước mới
                            </span>
                          )}
                        </div>
                        <div className="tiny muted">
                          {baselineLabel(data, room, utilityPeriod)} · {base?.electric ?? 0} ·{' '}
                          {base?.water ?? 0}
                        </div>
                      </div>
                      <NumberInput
                        value={draft.electric}
                        invalid={electricBad}
                        onChange={(value) => patchDraft(room.id, { electric: value })}
                      />
                      <NumberInput
                        value={draft.water}
                        invalid={waterBad}
                        onChange={(value) => patchDraft(room.id, { water: value })}
                      />
                    </div>

                    {(kwh !== null || m3 !== null) && (
                      <div
                        className="tiny"
                        style={{
                          paddingBottom: 6,
                          marginTop: -6,
                          color: backwards ? 'var(--danger)' : spike ? 'var(--warn)' : 'var(--muted)',
                        }}
                      >
                        {backwards
                          ? backwardsHint
                          : `${kwh ?? 0} kWh · ${m3 ?? 0} m³${
                              amount !== null ? ` = ${formatMoney(amount)} đ` : ''
                            }${usageNote ? ` (${usageNote})` : ''}${
                              spike ? ` · cao gấp ${(kwh! / avg!).toFixed(1)} lần bình thường` : ''
                            }`}
                        <button
                          className="btn ghost sm"
                          style={{ marginLeft: 8, padding: '2px 8px', minHeight: 0 }}
                          onClick={() => commit(room, draft)}
                        >
                          Lưu
                        </button>
                      </div>
                    )}

                    {draft.changing === 'electric' && (
                      <MeterResetPanel
                        kind="electric"
                        draft={draft}
                        onPatch={(patch) => patchDraft(room.id, patch)}
                        onCancel={() =>
                          patchDraft(room.id, {
                            electricReset: null,
                            electricNewStart: 0,
                            changing: null,
                          })
                        }
                        onApply={() => {
                          patchDraft(room.id, { changing: null })
                          void commit(room, { ...draft, changing: null })
                        }}
                      />
                    )}

                    {draft.changing === 'water' && (
                      <MeterResetPanel
                        kind="water"
                        draft={draft}
                        onPatch={(patch) => patchDraft(room.id, patch)}
                        onCancel={() =>
                          patchDraft(room.id, {
                            waterReset: null,
                            waterNewStart: 0,
                            changing: null,
                          })
                        }
                        onApply={() => {
                          patchDraft(room.id, { changing: null })
                          void commit(room, { ...draft, changing: null })
                        }}
                      />
                    )}

                    {!draft.changing && (collectsElectric || collectsWater) && (
                      <div
                        className="row"
                        style={{ paddingBottom: 10, marginTop: -4, gap: 6, flexWrap: 'wrap' }}
                      >
                        {collectsElectric && (
                          <button
                            className="btn ghost sm"
                            style={{ padding: '2px 8px', minHeight: 0 }}
                            onClick={() => patchDraft(room.id, { changing: 'electric' })}
                          >
                            Thay ĐH điện
                          </button>
                        )}
                        {collectsWater && (
                          <button
                            className="btn ghost sm"
                            style={{ padding: '2px 8px', minHeight: 0 }}
                            onClick={() => patchDraft(room.id, { changing: 'water' })}
                          >
                            Thay ĐH nước
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="meter-row meter-total">
                <div>
                  <div className="strong">Tổng cộng</div>
                  {usageTotals.counted < rooms.length && usageTotals.counted > 0 && (
                    <div className="tiny muted">
                      {usageTotals.counted}/{rooms.length} phòng
                    </div>
                  )}
                </div>
                <div className="num strong right">
                  {usageTotals.counted > 0 ? `${formatNumber(usageTotals.totalKwh)} kWh` : '—'}
                </div>
                <div className="num strong right">
                  {usageTotals.counted > 0 ? `${formatNumber(usageTotals.totalM3)} m³` : '—'}
                </div>
              </div>
              {usageTotals.counted > 0 && usageTotals.totalAmount > 0 && (
                <div className="tiny muted" style={{ textAlign: 'right', paddingBottom: 4 }}>
                  ≈ {formatMoney(usageTotals.totalAmount)} đ
                </div>
              )}
            </div>
          </Card>

          <button
            className="btn primary block"
            onClick={async () => {
              let saved = 0
              for (const room of rooms) {
                const draft = drafts[room.id]
                if (draft?.electric !== null && draft?.water !== null && draft) {
                  await saveReading({
                    roomId: room.id,
                    period: utilityPeriod,
                    electricEnd: draft.electric,
                    waterEnd: draft.water,
                    electricReset: draft.electricReset ?? undefined,
                    electricNewStart: draft.electricReset !== null ? (draft.electricNewStart ?? 0) : undefined,
                    waterReset: draft.waterReset ?? undefined,
                    waterNewStart: draft.waterReset !== null ? (draft.waterNewStart ?? 0) : undefined,
                  })
                  saved += 1
                }
              }
              toast(`Đã lưu điện nước cho ${saved} phòng`)
            }}
          >
            Lưu tất cả
          </button>
        </>
      )}

      {toastNode}
    </Page>
  )
}
