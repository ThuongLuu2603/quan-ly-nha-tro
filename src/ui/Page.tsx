import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function Page({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: string
  subtitle?: string
  back?: boolean | string
  action?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <>
      <header className="app-header">
        {back && (
          <button
            className="back-btn"
            aria-label="Quay lại"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            ‹
          </button>
        )}
        <h1>
          {title}
          {subtitle && (
            <>
              <br />
              <span className="sub">{subtitle}</span>
            </>
          )}
        </h1>
        {action}
      </header>
      <main className="app-main">{children}</main>
    </>
  )
}
