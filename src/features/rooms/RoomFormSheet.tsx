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
  const [extraFees, setExtraFees] = useState<ExtraFee[]>(room?.extraFees ?? [])
  const [note, setNote] = useState(room?.note ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      electricPrice,
      waterPrice,
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
        <Field label="Tên phòng">
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

        <div className="grid-2">
          <Field label="Giá điện / kWh">
            <MoneyInput value={electricPrice} onChange={setElectricPrice} />
          </Field>
          <Field label="Giá nước / m³">
            <MoneyInput value={waterPrice} onChange={setWaterPrice} />
          </Field>
        </div>

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
                    placeholder="Tiền rác"
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
          <div className="hint">Để trống nếu bạn chỉ thu tiền phòng, điện và nước.</div>
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
