import { useEffect, useMemo, useState } from 'react'

import { useSearchParams } from 'react-router-dom'

import { saveReading } from '../../data/actions'

import { activeTenancy, readingOf, readingsOfRoom } from '../../data/selectors'

import { useDataset, type Dataset } from '../../data/store'

import * as dt from '../../domain/dates'

import { roomCollectsMeteredUtilities } from '../../domain/billing'

import { formatMoney, formatNumber } from '../../domain/money'

import type { ID, Period, Room } from '../../domain/types'

import { Banner, Card, EmptyState, NumberInput, useToast } from '../../ui/components'

import { Page } from '../../ui/Page'



interface Draft {

  electric: number | null

  water: number | null

}



/** Ky dien nuoc can nhap: thang truoc thang phat phieu. */

function defaultUtilityPeriod(): Period {

  const now = dt.today()

  const { day } = dt.parseISO(now)

  const period = dt.periodOf(now)

  return day >= 25 ? period : dt.prevPeriod(period)

}



function baselineOf(data: Dataset, room: Room, utilityPeriod: Period): { electric: number; water: number } | null {

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

      data.rooms.filter(

        (room) => roomCollectsMeteredUtilities(room) && activeTenancy(data, room.id),

      ),

    [data],

  )



  useEffect(() => {

    const next: Record<ID, Draft> = {}

    for (const room of data.rooms) {

      const reading = readingOf(data, room.id, utilityPeriod)

      next[room.id] = {

        electric: reading ? reading.electricEnd : null,

        water: reading ? reading.waterEnd : null,

      }

    }

    setDrafts(next)

  }, [utilityPeriod, data])



  const invoiceMonths = useMemo(() => {

    const current = dt.periodOf(dt.today())

    return [dt.prevPeriod(current), current, dt.nextPeriod(current)]

  }, [])



  const commit = async (room: Room, draft: Draft) => {

    if (draft.electric === null || draft.water === null) return

    const existing = readingOf(data, room.id, utilityPeriod)

    if (existing && existing.electricEnd === draft.electric && existing.waterEnd === draft.water) return

    await saveReading({

      roomId: room.id,

      period: utilityPeriod,

      electricEnd: draft.electric,

      waterEnd: draft.water,

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
      const draft = drafts[room.id] ?? { electric: null, water: null }
      const kwh = base && draft.electric !== null ? draft.electric - base.electric : null
      const m3 = base && draft.water !== null ? draft.water - base.water : null

      if (kwh !== null && m3 !== null && kwh >= 0 && m3 >= 0) {
        totalKwh += kwh
        totalM3 += m3
        totalAmount += kwh * room.electricPrice + m3 * room.waterPrice
        counted += 1
      }
    }

    return { totalKwh, totalM3, totalAmount, counted }
  }, [rooms, data, utilityPeriod, drafts])

  return (

    <Page

      title="Nhập điện nước"

      subtitle={dt.formatInvoiceMonthLabel(invoiceMonth)}

    >

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

          icon="⏱"

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

                const draft = drafts[room.id] ?? { electric: null, water: null }

                const kwh = base && draft.electric !== null ? draft.electric - base.electric : null

                const m3 = base && draft.water !== null ? draft.water - base.water : null

                const avg = averageUsage(data, room.id, utilityPeriod)



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

                          {baselineLabel(data, room, utilityPeriod)} · {base?.electric ?? 0} ·{' '}

                          {base?.water ?? 0}

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

                          ? 'Số mới nhỏ hơn số đầu kỳ, kiểm tra lại.'

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

              <div className="meter-row meter-total">
                <div>
                  <div className="strong">Tổng cộng</div>
                  {usageTotals.counted < rooms.length && usageTotals.counted > 0 && (
                    <div className="tiny muted">{usageTotals.counted}/{rooms.length} phòng</div>
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


