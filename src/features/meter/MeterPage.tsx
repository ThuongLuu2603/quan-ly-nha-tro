import { useEffect, useMemo, useState } from 'react'
import { saveReading } from '../../data/actions'
import { activeTenancy, readingOf, readingsOfRoom } from '../../data/selectors'
import { useDataset, type Dataset } from '../../data/store'
import * as dt from '../../domain/dates'
import { roomCollectsMeteredUtilities } from '../../domain/billing'
import { formatMoney } from '../../domain/money'
import type { ID, Period, Room } from '../../domain/types'
import { Banner, Card, EmptyState, NumberInput, useToast } from '../../ui/components'
import { Page } from '../../ui/Page'

interface Draft {
  electric: number | null
  water: number | null
}

/** Cuoi thang thi chot thang hien tai, dau thang thi van dang chot thang truoc. */
function defaultPeriod(): Period {
  const now = dt.today()
  const { day } = dt.parseISO(now)
  const period = dt.periodOf(now)
  return day >= 25 ? period : dt.prevPeriod(period)
}

function baselineOf(data: Dataset, room: Room, period: Period): { electric: number; water: number } | null {
  const tenancy = activeTenancy(data, room.id)
  if (!tenancy) return null
  const prev = readingOf(data, room.id, dt.prevPeriod(period))
  if (prev && dt.periodOf(tenancy.startDate) < period) {
    return { electric: prev.electricEnd, water: prev.waterEnd }
  }
  return { electric: tenancy.electricStart, water: tenancy.waterStart }
}

function baselineLabel(data: Dataset, room: Room, period: Period): string {
  const tenancy = activeTenancy(data, room.id)
  if (!tenancy) return 'đầu kỳ'
  const prev = readingOf(data, room.id, dt.prevPeriod(period))
  if (!prev || dt.periodOf(tenancy.startDate) >= period) return 'bàn giao'
  return `cuối ${dt.formatPeriodShort(dt.prevPeriod(period))}`
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
  const [period, setPeriod] = useState<Period>(defaultPeriod)
  const [drafts, setDrafts] = useState<Record<ID, Draft>>({})

  const rooms = useMemo(
    () =>
      data.rooms.filter(
        (room) => roomCollectsMeteredUtilities(room) && activeTenancy(data, room.id),
      ),
    [data],
  )

  useEffect(() => {
    const next: Record<ID, Draft> = {}
    for (const room of data.rooms) {
      const reading = readingOf(data, room.id, period)
      next[room.id] = {
        electric: reading ? reading.electricEnd : null,
        water: reading ? reading.waterEnd : null,
      }
    }
    setDrafts(next)
  }, [period, data])

  const periods = useMemo(() => {
    const current = dt.periodOf(dt.today())
    return [dt.prevPeriod(dt.prevPeriod(current)), dt.prevPeriod(current), current]
  }, [])

  const commit = async (room: Room, draft: Draft) => {
    if (draft.electric === null || draft.water === null) return
    const existing = readingOf(data, room.id, period)
    if (existing && existing.electricEnd === draft.electric && existing.waterEnd === draft.water) return
    await saveReading({
      roomId: room.id,
      period,
      electricEnd: draft.electric,
      waterEnd: draft.water,
    })
    toast(`Đã lưu chỉ số ${room.name}`)
  }

  const missing = rooms.filter((room) => !readingOf(data, room.id, period)).length

  return (
    <Page
      title="Nhập chỉ số"
      subtitle={`${dt.formatPeriodMeterClose(period)} · ${dt.formatPeriodRange(period)}`}
    >
      <Banner tone="info">
        Mỗi tháng chỉ nhập <strong>số đồng hồ cuối tháng</strong> (đọc khoảng ngày 30–31 hoặc đúng mốc
        phát phiếu). Số <strong>bàn giao</strong> lúc nhận phòng không nhập ở đây — app tự lấy làm điểm
        đầu tháng đầu tiên.
      </Banner>

      <div className="chip-row">
        {periods.map((p) => (
          <button
            key={p}
            className={p === period ? 'chip active' : 'chip'}
            onClick={() => setPeriod(p)}
          >
            {dt.formatPeriodShort(p)}
          </button>
        ))}
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon="⏱"
          text="Không có phòng trọ nào cần nhập chỉ số tháng này (phòng chỉ thu tiền nhà sẽ không hiện ở đây)."
        />
      ) : (
        <>
          {missing > 0 && (
            <Banner tone="info">
              Còn {missing} phòng chưa {dt.formatPeriodMeterClose(period)}. Nhập xong một lần là dùng
              được cho mọi phòng, kể cả phòng có mốc phát phiếu khác nhau.
            </Banner>
          )}

          <Card flush>
            <div style={{ padding: '12px 16px' }}>
              <div className="meter-row" style={{ paddingTop: 0 }}>
                <div className="tiny muted strong">PHÒNG</div>
                <div className="tiny muted strong right">ĐIỆN</div>
                <div className="tiny muted strong right">NƯỚC</div>
              </div>

              {rooms.map((room) => {
                const base = baselineOf(data, room, period)
                const draft = drafts[room.id] ?? { electric: null, water: null }
                const kwh = base && draft.electric !== null ? draft.electric - base.electric : null
                const m3 = base && draft.water !== null ? draft.water - base.water : null
                const avg = averageUsage(data, room.id, period)

                const backwards = (kwh !== null && kwh < 0) || (m3 !== null && m3 < 0)
                const spike = kwh !== null && avg !== null && avg > 0 && kwh > avg * 1.5

                const amount =
                  kwh !== null && m3 !== null && kwh >= 0 && m3 >= 0
                    ? kwh * room.electricPrice + m3 * room.waterPrice
                    : null

                return (
                  <div key={room.id}>
                    <div className="meter-row">
                      <div>
                        <div className="strong">{room.name}</div>
                        <div className="tiny muted">
                          {baselineLabel(data, room, period)} {base?.electric ?? 0} · {base?.water ?? 0}
                        </div>
                      </div>
                      <NumberInput
                        value={draft.electric}
                        invalid={kwh !== null && kwh < 0}
                        onChange={(value) => {
                          const next = { ...draft, electric: value }
                          setDrafts((prev) => ({ ...prev, [room.id]: next }))
                        }}
                      />
                      <NumberInput
                        value={draft.water}
                        invalid={m3 !== null && m3 < 0}
                        onChange={(value) => {
                          const next = { ...draft, water: value }
                          setDrafts((prev) => ({ ...prev, [room.id]: next }))
                        }}
                      />
                    </div>

                    {(kwh !== null || m3 !== null) && (
                      <div
                        className="tiny"
                        style={{
                          paddingBottom: 10,
                          marginTop: -6,
                          color: backwards ? 'var(--danger)' : spike ? 'var(--warn)' : 'var(--muted)',
                        }}
                      >
                        {backwards
                          ? 'Chỉ số mới nhỏ hơn chỉ số cũ, kiểm tra lại.'
                          : `${kwh ?? 0} kWh · ${m3 ?? 0} m³${
                              amount !== null ? ` = ${formatMoney(amount)} đ` : ''
                            }${spike ? ` · cao gấp ${(kwh! / avg!).toFixed(1)} lần bình thường` : ''}`}
                        <button
                          className="btn ghost sm"
                          style={{ marginLeft: 8, padding: '2px 8px', minHeight: 0 }}
                          onClick={() => commit(room, draft)}
                        >
                          Lưu
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
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
                    period,
                    electricEnd: draft.electric,
                    waterEnd: draft.water,
                  })
                  saved += 1
                }
              }
              toast(`Đã lưu chỉ số cho ${saved} phòng`)
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
