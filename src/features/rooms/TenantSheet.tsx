import { useState } from 'react'
import { deleteTenant, saveTenant } from '../../data/actions'
import { newId } from '../../data/db'
import type { ID, Tenant } from '../../domain/types'
import { Field, Sheet, TextInput } from '../../ui/components'

export function TenantSheet({
  tenancyId,
  tenant,
  onClose,
}: {
  tenancyId: ID
  tenant?: Tenant
  onClose: () => void
}) {
  const [fullName, setFullName] = useState(tenant?.fullName ?? '')
  const [phone, setPhone] = useState(tenant?.phone ?? '')
  const [idNumber, setIdNumber] = useState(tenant?.idNumber ?? '')
  const [isPrimary, setIsPrimary] = useState(tenant?.isPrimary ?? false)

  const save = async () => {
    if (!fullName.trim()) return
    await saveTenant({
      id: tenant?.id ?? newId(),
      tenancyId,
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      idNumber: idNumber.trim() || undefined,
      isPrimary,
      note: tenant?.note,
    })
    onClose()
  }

  return (
    <Sheet title={tenant ? 'Sửa người ở' : 'Thêm người ở'} onClose={onClose}>
      <div className="stack">
        <Field label="Họ và tên">
          <TextInput value={fullName} onChange={setFullName} placeholder="Nguyễn Văn A" />
        </Field>
        <Field label="Số điện thoại" hint="Dùng để mở thẳng chat Zalo khi gửi phiếu.">
          <TextInput value={phone} onChange={setPhone} inputMode="tel" placeholder="09xx xxx xxx" />
        </Field>
        <Field label="Số CCCD">
          <TextInput value={idNumber} onChange={setIdNumber} inputMode="numeric" />
        </Field>

        <label className="row" style={{ gap: 10 }}>
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          <span>Là người đại diện đứng tên phòng</span>
        </label>

        <button className="btn primary block" onClick={save} disabled={!fullName.trim()}>
          Lưu
        </button>

        {tenant && (
          <button
            className="btn danger block"
            onClick={async () => {
              await deleteTenant(tenant.id)
              onClose()
            }}
          >
            Xoá người này khỏi phòng
          </button>
        )}
      </div>
    </Sheet>
  )
}
