import { NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './sync/AuthProvider'
import { AuthGate } from './features/auth/AuthGate'
import { SyncBar } from './sync/SyncBar'
import { HomePage } from './features/home/HomePage'
import { MeterPage } from './features/meter/MeterPage'
import { IssuePage } from './features/invoices/IssuePage'
import { InvoiceListPage } from './features/invoices/InvoiceListPage'
import { InvoiceDetailPage } from './features/invoices/InvoiceDetailPage'
import { RoomsPage } from './features/rooms/RoomsPage'
import { RoomDetailPage } from './features/rooms/RoomDetailPage'
import { MoveInPage } from './features/tenancy/MoveInPage'
import { CheckoutPage } from './features/tenancy/CheckoutPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { PrintBatchPage } from './features/print/PrintBatchPage'
import { IconHome, IconInvoice, IconMeter, IconRooms, IconSettings } from './ui/icons'
import type { ComponentType, SVGProps } from 'react'

const NAV: {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
}[] = [
  { to: '/', label: 'Trang chủ', Icon: IconHome },
  { to: '/chi-so', label: 'Điện nước', Icon: IconMeter },
  { to: '/phieu', label: 'Phiếu', Icon: IconInvoice },
  { to: '/phong', label: 'Phòng', Icon: IconRooms },
  { to: '/cai-dat', label: 'Cài đặt', Icon: IconSettings },
]

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <div className="app">
          <SyncBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chi-so" element={<MeterPage />} />
            <Route path="/phat-phieu" element={<IssuePage />} />
            <Route path="/phieu" element={<InvoiceListPage />} />
            <Route path="/phieu/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="/phong" element={<RoomsPage />} />
            <Route path="/phong/:roomId" element={<RoomDetailPage />} />
            <Route path="/phong/:roomId/nhan-phong" element={<MoveInPage />} />
            <Route path="/phong/:roomId/tra-phong" element={<CheckoutPage />} />
            <Route path="/bao-cao" element={<ReportsPage />} />
            <Route path="/cai-dat" element={<SettingsPage />} />
            <Route path="/in-phieu" element={<PrintBatchPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>

          <nav className="bottom-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <span className="icon">
                  <item.Icon size={20} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </AuthGate>
    </AuthProvider>
  )
}
