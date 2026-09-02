import { useState } from 'react'
import { createRoom, saveRoom } from '../../data/actions'
import { newId } from '../../data/db'
import type { ExtraFee, Room, Settings } from '../../domain/types'
import { Field, MoneyInput, Select, Sheet, TextInput } from '../../ui/components'

const CYCLE_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `Ngày ${i + 1}`,
}))

export function RoomFormSheet({
  room,
  settings,
  onClose,
}: {
  room?: Room
  settings: Settings
  onClose: () => void
}) {
  const [name, setName] = useState(room?.name ?? '')
  const [rent, setRent] = useState(room?.defaultRent ?? 0)
  const [deposit, setDeposit] = useState(room?.defaultDeposit ?? 0)
  const [cycleDay, setCycleDay] = useState(room?.defaultCycleDay ?? 1)
  const [electricPrice, setElectricPrice] = useState(room?.electricPrice ?? settings.defaultElectricPrice)
  const [waterPrice, setWaterPrice] = useState(room?.waterPrice ?? settings.defaultWaterPrice)
  const [garbageFee, setGarbageFee] = useState(room?.garbageFee ?? settings.defaultGarbageFee ?? 0)
  const [extraFees, setExtraFees] = useState<ExtraFee[]>(room?.extraFees ?? [])
  const [note, setNote] = useState(room?.note ?? '')
  const [saving, setSaving] = useState(false)

  const rentOnly = electricPrice === 0 && waterPrice === 0 && garbageFee === 0

  const setRentOnly = (on: boolean) => {
    if (on) {
      setElectricPrice(0)
      setWaterPrice(0)
      setGarbageFee(0)
      return
    }
    setElectricPrice(room?.electricPrice || settings.defaultElectricPrice)
    setWaterPrice(room?.waterPrice || settings.defaultWaterPrice)
    setGarbageFee(room?.garbageFee ?? settings.defaultGarbageFee ?? 0)
  }

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      electricPrice,
      waterPrice,
      garbageFee,
      extraFees: extraFees.filter((f) => f.label.trim()),
      defaultRent: rent,
      defaultDeposit: deposit,
      defaultCycleDay: cycleDay,
      note: note.trim() || undefined,
    }
    if (room) await saveRoom({ ...room, ...payload })
    else await createRoom(payload)
    onClose()
  }

  return (
    <Sheet title={room ? `Sửa phòng ${room.name}` : 'Thêm phòng'} onClose={onClose}>
      <div className="stack">
        <Field label="Tên phòng" hint="Phòng trọ hoặc tên nhà cho thuê (vd: Nhà 12).">
          <TextInput value={name} onChange={setName} placeholder="P101" />
        </Field>

        <div className="grid-2">
          <Field label="Giá thuê / tháng">
            <MoneyInput value={rent} onChange={setRent} />
          </Field>
          <Field label="Tiền cọc thường thu">
            <MoneyInput value={deposit} onChange={setDeposit} />
          </Field>
        </div>

        <Field
          label="Mốc ngày phát phiếu"
          hint="Tiền phòng chạy tròn một tháng từ mốc này tới đúng mốc tháng sau."
        >
          <Select value={cycleDay} onChange={setCycleDay} options={CYCLE_DAYS} />
        </Field>

        <label className="rent-only-toggle">
          <input type="checkbox" checked={rentOnly} onChange={(e) => setRentOnly(e.target.checked)} />
          <span>
            <strong>Chỉ thu tiền nhà</strong> — khách tự trả điện, nước, rác. App không nhập chỉ số và
            không cộng các khoản này vào phiếu.
          </span>
        </label>

        <div className="grid-3">
          <Field label="Điện / kWh">
            <MoneyInput value={electricPrice} onChange={setElectricPrice} disabled={rentOnly} />
          </Field>
          <Field label="Nước / m³">
            <MoneyInput value={waterPrice} onChange={setWaterPrice} disabled={rentOnly} />
          </Field>
          <Field label="Rác / tháng">
            <MoneyInput value={garbageFee} onChange={setGarbageFee} disabled={rentOnly} />
          </Field>
        </div>
        <div className="hint">Để 0 nếu không thu. Khoản cố định tự cộng vào mỗi phiếu tháng.</div>

        <div className="field">
          <label>Khoản cố định hàng tháng</label>
          <div className="stack tight">
            {extraFees.map((fee, index) => (
              <div className="row" key={fee.id}>
                <div className="grow">
                  <TextInput
                    value={fee.label}
                    onChange={(value) =>
                      setExtraFees((prev) =>
                        prev.map((f, i) => (i === index ? { ...f, label: value } : f)),
                      )
                    }
                    placeholder="Phí mạng, giữ xe..."
                  />
                </div>
                <div style={{ width: 130 }}>
                  <MoneyInput
                    value={fee.amount}
                    onChange={(value) =>
                      setExtraFees((prev) =>
                        prev.map((f, i) => (i === index ? { ...f, amount: value } : f)),
                      )
                    }
                  />
                </div>
                <button
                  className="btn ghost"
                  onClick={() => setExtraFees((prev) => prev.filter((_, i) => i !== index))}
                >
                  Xoá
                </button>
              </div>
            ))}
            <button
              className="btn sm"
              onClick={() => setExtraFees((prev) => [...prev, { id: newId(), label: '', amount: 0 }])}
            >
              + Thêm khoản cố định
            </button>
          </div>
          <div className="hint">Để trống nếu bạn chỉ thu tiền phòng, điện, nước và rác.</div>
        </div>

        <Field label="Ghi chú">
          <TextInput value={note} onChange={setNote} placeholder="Tầng 2, hướng ban công" />
        </Field>

        <button className="btn primary block" onClick={save} disabled={!name.trim() || saving}>
          Lưu phòng
        </button>
      </div>
    </Sheet>
  )
}
