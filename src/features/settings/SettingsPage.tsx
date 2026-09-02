import { useRef, useState } from 'react'
import { saveSettings } from '../../data/actions'
import { VN_BANKS } from '../../data/banks'
import { exportBackup, importBackup, isBackupFile, wipeAll } from '../../data/backup'
import { useDataset } from '../../data/store'
import { today } from '../../domain/dates'
import { downloadBlob } from '../../receipt/share'
import { buildVietQRPayload } from '../../receipt/vietqr'
import { useAuth } from '../../sync/AuthProvider'
import {
  Banner,
  Card,
  Field,
  MoneyInput,
  Select,
  TextInput,
  useToast,
} from '../../ui/components'
import { Page } from '../../ui/Page'

export function SettingsPage() {
  const data = useDataset()
  const { toast, toastNode } = useToast()
  const { configured, user, signOut, syncNow } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const s = data.settings
  const qrReady = Boolean(s.bankBin && s.bankAccountNo)

  const doExport = async () => {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `sao-luu-nha-tro-${today()}.json`)
    await saveSettings({ lastBackupAt: new Date().toISOString() })
    toast('Đã tải file sao lưu, nhớ cất lên Drive hoặc gửi vào Zalo của bạn')
  }

  const doImport = async (file: File) => {
    setImporting(true)
    try {
      const parsed = JSON.parse(await file.text())
      if (!isBackupFile(parsed)) {
        toast('File này không phải bản sao lưu của app')
        return
      }
      if (!window.confirm('Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại. Tiếp tục?')) return
      await importBackup(parsed)
      toast('Đã khôi phục dữ liệu')
    } catch {
      toast('Không đọc được file sao lưu')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Page title="Cài đặt">
      {configured && user && (
        <Card title="Tài khoản đồng bộ">
          <div className="stack tight">
            <div className="small muted">Đang đăng nhập: {user.email}</div>
            <div className="small muted">
              Cùng một tài khoản trên mọi điện thoại sẽ thấy cùng dữ liệu khi có mạng.
            </div>
            <button className="btn block" onClick={() => void syncNow().then(() => toast('Đã đồng bộ'))}>
              Đồng bộ ngay
            </button>
            <button className="btn ghost block" onClick={() => void signOut()}>
              Đăng xuất
            </button>
          </div>
        </Card>
      )}

      <Card title="Thông tin nhà trọ">
        <div className="stack">
          <Field label="Tên hiển thị trên phiếu">
            <TextInput
              value={s.landlordName}
              onChange={(value) => saveSettings({ landlordName: value })}
              placeholder="Nhà trọ Bình An"
            />
          </Field>
          <Field label="Địa chỉ">
            <TextInput value={s.address} onChange={(value) => saveSettings({ address: value })} />
          </Field>
          <Field label="Số điện thoại">
            <TextInput
              value={s.phone}
              onChange={(value) => saveSettings({ phone: value })}
              inputMode="tel"
            />
          </Field>
        </div>
      </Card>

      <Card title="Tài khoản nhận chuyển khoản">
        <div className="stack">
          <Field label="Ngân hàng" hint="Dùng để sinh mã QR VietQR ngay trên phiếu.">
            <Select
              value={s.bankBin}
              onChange={(value) => saveSettings({ bankBin: value })}
              options={[
                { value: '', label: '— Chưa chọn —' },
                ...VN_BANKS.map((b) => ({ value: b.bin, label: b.name })),
              ]}
            />
          </Field>
          <Field label="Số tài khoản">
            <TextInput
              value={s.bankAccountNo}
              onChange={(value) => saveSettings({ bankAccountNo: value.replace(/\s/g, '') })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Tên chủ tài khoản">
            <TextInput
              value={s.bankAccountName}
              onChange={(value) => saveSettings({ bankAccountName: value })}
            />
          </Field>

          {qrReady ? (
            <Banner tone="info">
              Mã QR sẽ tự nhúng số tiền và nội dung dạng "P101 T09.2026". Mã sinh ngay trên máy nên
              không cần mạng.
            </Banner>
          ) : (
            <Banner tone="warn">Chưa đủ thông tin nên phiếu sẽ không có mã QR.</Banner>
          )}

          {qrReady && (
            <details>
              <summary className="small muted">Xem chuỗi mã QR để đối chiếu</summary>
              <div className="tiny muted" style={{ wordBreak: 'break-all', marginTop: 8 }}>
                {buildVietQRPayload({
                  bankBin: s.bankBin,
                  accountNo: s.bankAccountNo,
                  amount: 1_500_000,
                  message: 'P101 T09.2026',
                })}
              </div>
            </details>
          )}
        </div>
      </Card>

      <Card title="Giá mặc định cho phòng mới">
        <div className="grid-2">
          <Field label="Điện / kWh">
            <MoneyInput
              value={s.defaultElectricPrice}
              onChange={(value) => saveSettings({ defaultElectricPrice: value })}
            />
          </Field>
          <Field label="Nước / m³">
            <MoneyInput
              value={s.defaultWaterPrice}
              onChange={(value) => saveSettings({ defaultWaterPrice: value })}
            />
          </Field>
        </div>
        <Field label="Tiền rác / tháng">
          <MoneyInput
            value={s.defaultGarbageFee ?? 0}
            onChange={(value) => saveSettings({ defaultGarbageFee: value })}
          />
        </Field>
        <div className="hint" style={{ marginTop: 8 }}>
          Đổi ở đây không ảnh hưởng phòng đã tạo, mỗi phòng vẫn giữ giá riêng.
        </div>
      </Card>

      <Card title="Ghi chú cuối phiếu">
        <TextInput
          value={s.invoiceFooter}
          onChange={(value) => saveSettings({ invoiceFooter: value })}
        />
      </Card>

      <Card title="Sao lưu dữ liệu">
        <div className="stack tight">
          <div className="small muted">
            Dữ liệu nằm trong máy và (khi đã đăng nhập) trên cloud. Vẫn nên xuất file sao lưu
            định kỳ phòng khi xoá app hoặc mất máy.
            {s.lastBackupAt && (
              <> Lần sao lưu gần nhất {new Date(s.lastBackupAt).toLocaleDateString('vi-VN')}.</>
            )}
          </div>

          <button className="btn primary block" onClick={doExport}>
            Tải file sao lưu
          </button>

          <button
            className="btn block"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            Khôi phục từ file sao lưu
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void doImport(file)
            }}
          />

          <button
            className="btn danger block"
            onClick={async () => {
              if (!window.confirm('Xoá sạch toàn bộ phòng, khách, chỉ số và phiếu?')) return
              if (!window.confirm('Chắc chắn chứ? Hành động này không hoàn tác được.')) return
              await wipeAll()
              toast('Đã xoá toàn bộ dữ liệu')
            }}
          >
            Xoá toàn bộ dữ liệu
          </button>
        </div>
      </Card>

      <Card title="Cách tính tiền app đang dùng">
        <div className="stack tight small muted">
          <div>
            Tiền phòng chạy tròn một tháng theo mốc riêng của từng phòng, ví dụ mốc 25 thì kỳ là 25/08
            đến 25/09.
          </div>
          <div>
            Điện nước theo tháng dương lịch, phiếu phát trong tháng nào thì lấy số của tháng liền trước.
            Tiền rác là khoản cố định mỗi kỳ (nếu đã nhập ở phòng).
          </div>
          <div>
            Khách vào giữa tháng thì thu tiền lẻ tới mốc kế tiếp rồi một kỳ tròn, các phiếu sau tự bỏ
            qua phần tiền phòng đã đóng trước.
          </div>
          <div>Trả phòng thì hoàn lại tiền phòng những ngày chưa ở và tất toán vào tiền cọc.</div>
        </div>
      </Card>

      {toastNode}
    </Page>
  )
}
