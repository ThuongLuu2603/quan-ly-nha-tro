export type ID = string

/** Ngay dang 'YYYY-MM-DD'. So sanh chuoi truc tiep cho ra dung thu tu thoi gian. */
export type ISODate = string

/** Ky duong lich dang 'YYYY-MM'. */
export type Period = string

export interface ExtraFee {
  id: ID
  label: string
  amount: number
}

export interface Room {
  id: ID
  name: string
  order: number
  electricPrice: number
  waterPrice: number
  extraFees: ExtraFee[]
  defaultRent: number
  defaultDeposit: number
  defaultCycleDay: number
  note?: string
}

/**
 * Mot luot khach thue phong. Gia thue, tien coc va moc ngay chot rieng cho tung
 * luot vi doi khach la doi het.
 */
export interface Tenancy {
  id: ID
  roomId: ID
  startDate: ISODate
  endDate?: ISODate
  rent: number
  deposit: number
  cycleDay: number
  electricStart: number
  waterStart: number
  /** Ngay bat dau ky tien phong dau tien chua duoc thu. Chan tren cua phan da tra. */
  rentPaidThrough: ISODate
  status: 'active' | 'closed'
  note?: string
}

export interface Tenant {
  id: ID
  tenancyId: ID
  fullName: string
  phone?: string
  idNumber?: string
  isPrimary: boolean
  note?: string
}

export interface Reading {
  id: ID
  roomId: ID
  period: Period
  electricEnd: number
  waterEnd: number
  readAt: ISODate
}

export type InvoiceKind = 'moveIn' | 'monthly' | 'checkout'

export type LineType =
  | 'rent'
  | 'rentProrated'
  | 'rentRefund'
  | 'electric'
  | 'water'
  | 'deposit'
  | 'depositRefund'
  | 'carryOver'
  | 'other'
  | 'discount'

export interface InvoiceLine {
  id: ID
  type: LineType
  label: string
  detail?: string
  qty: number
  unitPrice: number
  amount: number
}

/** 'carried' khong phai tien thuc, chi danh dau khoan no da doi sang phieu sau. */
export type PaymentMethod = 'cash' | 'transfer' | 'carried'

export interface Payment {
  id: ID
  date: ISODate
  amount: number
  method: PaymentMethod
  note?: string
  carriedTo?: ID
}

export interface Invoice {
  id: ID
  code: string
  roomId: ID
  tenancyId: ID
  kind: InvoiceKind
  issueDate: ISODate
  /** Ky tien phong, chi co khi phieu nay thuc su thu tien phong. */
  rentFrom?: ISODate
  rentTo?: ISODate
  /** Ky dien nuoc theo thang duong lich. */
  utilityPeriod?: Period
  lines: InvoiceLine[]
  total: number
  payments: Payment[]
  sentAt?: ISODate
  note?: string
  createdAt: ISODate
}

export interface Settings {
  id: 'app'
  landlordName: string
  phone: string
  address: string
  bankBin: string
  bankAccountNo: string
  bankAccountName: string
  defaultElectricPrice: number
  defaultWaterPrice: number
  invoiceFooter: string
  lastBackupAt?: ISODate
  /** Neu co thi app tu dong bo voi Supabase khi co mang. */
  supabaseUrl?: string
  supabaseAnonKey?: string
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
