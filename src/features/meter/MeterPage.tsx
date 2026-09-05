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
  /** Đang mở khung "thay đồng hồ" cho phòng này. */
  changing: boolean
}

const EMPTY_DRAFT: Draft = {
  electric: null,
  water: null,
  electricReset: null,
  electricNewStart: 0,
  waterReset: null,
  waterNewStart: 0,
  changing: false,
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
        changing: false,
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
                const hasReset = hasElectricReset || hasWaterReset

                // Usage hien thi: tinh 2 doan khi co reset.
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

                // Bat thuong: so phai tang lien tuc trong tung doan.
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

                return (
                  <div key={room.id}>
                    <div className="meter-row">
                      <div>
                        <div className="strong">
                          {room.name}
                          {hasReset && (
                            <span className="pill accent" style={{ marginLeft: 6 }}>
                              mới thay ĐH
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
                          ? 'Số mới nhỏ hơn số đầu kỳ — nếu vừa THAY ĐỒNG HỒ thì bấm «Thay đồng hồ» bên dưới.'
                          : `${kwh ?? 0} kWh · ${m3 ?? 0} m³${
                              amount !== null ? ` = ${formatMoney(amount)} đ` : ''
                            }${hasReset ? ' (gộp 2 đoạn cũ + mới)' : ''}${
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

                    {draft.changing ? (
                      <div
                        style={{
                          margin: '0 0 12px 12px',
                          padding: '10px 12px',
                          borderLeft: '3px solid var(--accent)',
                          background: 'var(--surface-2, transparent)',
                          borderRadius: 8,
                        }}
                      >
                        <div className="tiny muted" style={{ marginBottom: 8 }}>
                          Nhập <strong>số đồng hồ cũ lúc tháo</strong> và <strong>số đầu của đồng hồ mới</strong>{' '}
                          (thường 0). Chỉ nhập dòng nào thay thôi, dòng còn lại bỏ trống.
                        </div>
                        <div className="tiny strong" style={{ marginBottom: 4 }}>
                          Điện
                        </div>
                        <div className="meter-row" style={{ paddingBottom: 4 }}>
                          <div className="tiny muted">Đồng hồ cũ tháo tại</div>
                          <NumberInput
                            value={draft.electricReset}
                            onChange={(value) => patchDraft(room.id, { electricReset: value })}
                          />
                          <NumberInput
                            value={draft.electricNewStart}
                            onChange={(value) => patchDraft(room.id, { electricNewStart: value })}
                          />
                        </div>
                        <div className="tiny strong" style={{ marginTop: 8, marginBottom: 4 }}>
                          Nước
                        </div>
                        <div className="meter-row" style={{ paddingBottom: 4 }}>
                          <div className="tiny muted">Đồng hồ cũ tháo tại</div>
                          <NumberInput
                            value={draft.waterReset}
                            onChange={(value) => patchDraft(room.id, { waterReset: value })}
                          />
                          <NumberInput
                            value={draft.waterNewStart}
                            onChange={(value) => patchDraft(room.id, { waterNewStart: value })}
                          />
                        </div>
                        <div className="tiny muted" style={{ margin: '4px 0 8px' }}>
                          (Cột thứ 2 = số lúc tháo, cột thứ 3 = số đầu đồng hồ mới)
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn sm"
                            onClick={() =>
                              patchDraft(room.id, {
                                electricReset: null,
                                electricNewStart: 0,
                                waterReset: null,
                                waterNewStart: 0,
                                changing: false,
                              })
                            }
                          >
                            Bỏ
                          </button>
                          <button
                            className="btn primary sm"
                            style={{ flex: 1 }}
                            onClick={() => {
                              patchDraft(room.id, { changing: false })
                              void commit(room, { ...draft, changing: false })
                            }}
                          >
                            Áp dụng &amp; lưu
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ paddingBottom: 10, marginTop: -4 }}>
                        <button
                          className="btn ghost sm"
                          style={{ padding: '2px 8px', minHeight: 0 }}
                          onClick={() => patchDraft(room.id, { changing: true })}
                        >
                          Thay đồng hồ
                        </button>
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
