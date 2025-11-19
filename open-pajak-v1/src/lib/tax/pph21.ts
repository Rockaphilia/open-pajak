import {
  getPTKP,
  getTerBulananRate,
  getTerHarianRate,
  hitungPajakPasal17,
  roundDownToThousand,
} from './utils'
import { PASAL17_LAYERS } from './constants'
import type { TaxBreakdownRow, TaxResult } from './types'

export type PPh21SubjectType =
  | 'pegawai_tetap'
  | 'pensiunan'
  | 'pegawai_tidak_tetap'
  | 'bukan_pegawai'
  | 'peserta_kegiatan'
  | 'program_pensiun'
  | 'mantan_pegawai'
  | 'wpln'

export interface PPh21Input {
  subjectType: PPh21SubjectType
  brutoMonthly: number
  monthsPaid: number
  pensionContribution: number
  zakatOrDonation: number
  ptkpStatus: string
  scheme: 'lama' | 'ter'
  terCategory: 'A' | 'B' | 'C'
  bonusAnnual: number
  foreignTaxRate: number
  isDailyWorker?: boolean
}

const clampMonths = (months: number) => Math.min(12, Math.max(1, months || 1))

export function calculatePph21(input: PPh21Input): TaxResult {
  switch (input.subjectType) {
    case 'pegawai_tetap': {
      const months = clampMonths(input.monthsPaid)
      const brutoTahun = input.brutoMonthly * months + input.bonusAnnual
      const iuranTahun = input.pensionContribution * months
      const biayaJabatan = Math.min(brutoTahun * 0.05, 6000000)
      const nettoSetahun =
        brutoTahun - biayaJabatan - iuranTahun - input.zakatOrDonation
      const ptkp = getPTKP(input.ptkpStatus)
      const pkpRounded = roundDownToThousand(Math.max(0, nettoSetahun - ptkp))
      const pajakSetahun = hitungPajakPasal17(pkpRounded)
      return calculatePegawaiTetap(input, {
        months,
        brutoTahun,
        iuranTahun,
        biayaJabatan,
        nettoSetahun,
        ptkp,
        pkpRounded,
        pajakSetahun,
      })
    }
    case 'pensiunan':
      return calculatePensiunan(input)
    case 'pegawai_tidak_tetap':
      return calculatePegawaiTidakTetap(input)
    case 'bukan_pegawai':
      return calculateBukanPegawai(input)
    case 'peserta_kegiatan':
      return flatPasal17(input, 'Peserta kegiatan')
    case 'program_pensiun':
      return flatPasal17(input, 'Penarikan manfaat pensiun')
    case 'mantan_pegawai':
      return flatPasal17(input, 'Mantan pegawai')
    case 'wpln':
      return calculatePph26(input)
    default:
      return { totalTax: 0, breakdown: [] }
  }
}

function calculatePegawaiTetap(
  input: PPh21Input,
  context: {
    months: number
    brutoTahun: number
    iuranTahun: number
    biayaJabatan: number
    nettoSetahun: number
    ptkp: number
    pkpRounded: number
    pajakSetahun: number
  },
): TaxResult {
  const {
    months,
    brutoTahun,
    iuranTahun,
    biayaJabatan,
    nettoSetahun,
    ptkp,
    pkpRounded,
    pajakSetahun,
  } = context

  if (input.scheme === 'ter') {
    const terRate = getTerBulananRate(input.terCategory, input.brutoMonthly)
    const masaTax = input.brutoMonthly * terRate
    const terMonths = Math.min(11, months)
    const terPaid = masaTax * terMonths

    if (months < 12) {
      const bonusTax = input.bonusAnnual * terRate
      const total = terPaid + bonusTax
      const takeHomeAnnual = brutoTahun - total
      const takeHomePerMasa = takeHomeAnnual / Math.max(1, months)

      const rows: Array<TaxBreakdownRow> = [
        { label: 'Penghasilan Masa TER', variant: 'section' },
        { label: 'Bruto per masa', value: input.brutoMonthly },
        { label: 'Tarif TER', value: terRate, valueType: 'percent' },
        {
          label: 'PPh 21 TER per masa',
          value: masaTax,
          note: `${months} masa`,
        },
        {
          label: `Akumulasi TER (${months} masa)`,
          value: terPaid,
          variant: 'subtotal',
        },
        { label: 'Pengurang Penghasilan', variant: 'section' },
        {
          label: 'Biaya jabatan (5% maks 6 jt)',
          value: biayaJabatan,
        },
        { label: 'Iuran pensiun (setahun)', value: iuranTahun },
        { label: 'Zakat/sumbangan', value: input.zakatOrDonation },
        { label: 'Netto setahun', value: nettoSetahun, variant: 'subtotal' },
      ]
      if (input.bonusAnnual > 0) {
        rows.push({
          label: 'PPh 21 atas bonus (TER)',
          value: bonusTax,
        })
      }
      rows.push({
        label: 'Total PPh 21 (TER)',
        value: total,
        variant: 'total',
      })
      rows.push({ label: 'Take-home pay', variant: 'section' })
      rows.push({ label: 'Take-home setahun', value: takeHomeAnnual })
      rows.push({
        label: 'Take-home per masa',
        value: takeHomePerMasa,
        note: `${months} masa`,
      })

      return {
        totalTax: total,
        breakdown: rows,
      }
    }

    const difference = pajakSetahun - terPaid
    const adjustment = Math.max(0, difference)
    const overpaid = difference < 0 ? Math.abs(difference) : 0
    const totalTax = terPaid + adjustment

    const takeHomeAnnual = brutoTahun - totalTax
    const takeHomePerMasa = takeHomeAnnual / Math.max(1, months)

    const pasal17Rows = buildPasal17TierRows(pkpRounded)
  const breakdown = buildWaterfallTerRows({
    months,
    salaryAnnual: input.brutoMonthly * months,
    allowanceAnnual: input.bonusAnnual,
    brutoTahun,
      biayaJabatan,
      iuranTahun,
      zakat: input.zakatOrDonation,
      nettoSetahun,
      ptkp,
      pkpRounded,
    pasal17Rows,
    pajakSetahun,
    terRate,
    masaTax,
    terPaid,
    terMonths,
    adjustment,
    overpaid,
    takeHomeAnnual,
      takeHomePerMasa,
    })

    return {
      totalTax,
      breakdown,
    }
  }

  const totalTax = (pajakSetahun / 12) * months
  const takeHomeAnnual = brutoTahun - totalTax
  const takeHomePerMasa = takeHomeAnnual / Math.max(1, months)

  const breakdown: Array<TaxBreakdownRow> = [
    { label: 'Penghasilan', variant: 'section' },
    { label: 'Bruto setahun', value: brutoTahun },
    { label: 'Pengurang Penghasilan', variant: 'section' },
    { label: 'Biaya jabatan (5% maks 6 jt)', value: biayaJabatan },
    { label: 'Iuran pensiun (setahun)', value: iuranTahun },
    { label: 'Zakat/sumbangan', value: input.zakatOrDonation },
    {
      label: 'Penghasilan neto setahun',
      value: nettoSetahun,
      variant: 'subtotal',
    },
    { label: 'Perhitungan Tahunan', variant: 'section' },
    { label: 'PTKP', value: ptkp },
    { label: 'PKP dibulatkan', value: pkpRounded },
    { label: 'PPh 21 setahun', value: pajakSetahun },
    { label: `PPh 21 ${months} masa`, value: totalTax, variant: 'total' },
    { label: 'Take-home pay', variant: 'section' },
    { label: 'Take-home setahun', value: takeHomeAnnual },
    {
      label: 'Take-home per masa',
      value: takeHomePerMasa,
      note: `${months} masa`,
    },
  ]

  return {
    totalTax,
    breakdown,
  }
}

function calculatePensiunan(input: PPh21Input): TaxResult {
  const months = clampMonths(input.monthsPaid)
  const brutoTahun = input.brutoMonthly * months + input.bonusAnnual
  const biayaPensiun = Math.min(brutoTahun * 0.05, 2400000)
  const netto = brutoTahun - biayaPensiun - input.zakatOrDonation
  const ptkp = getPTKP(input.ptkpStatus)
  const pkpRounded = roundDownToThousand(Math.max(0, netto - ptkp))
  const pajakSetahun = hitungPajakPasal17(pkpRounded)
  const totalTax = (pajakSetahun / 12) * months

  return {
    totalTax,
    breakdown: [
      { label: 'Penghasilan', variant: 'section' },
      { label: 'Bruto setahun', value: brutoTahun },
      { label: 'Pengurang Penghasilan', variant: 'section' },
      {
        label: 'Biaya pensiun (5%, maks 2.4 juta)',
        value: biayaPensiun,
      },
      {
        label: 'Penghasilan neto setahun',
        value: netto,
        variant: 'subtotal',
      },
      { label: 'Perhitungan Tahunan', variant: 'section' },
      { label: 'PTKP', value: ptkp },
      { label: 'PKP dibulatkan', value: pkpRounded },
      { label: 'PPh 21 setahun', value: pajakSetahun },
      { label: `PPh 21 ${months} masa`, value: totalTax, variant: 'total' },
    ],
  }
}

function calculatePegawaiTidakTetap(input: PPh21Input): TaxResult {
  const months = clampMonths(input.monthsPaid)
  if (input.isDailyWorker) {
    const terRate = getTerHarianRate(input.terCategory, input.brutoMonthly)
    const taxPerDay = input.brutoMonthly * terRate
    const total = taxPerDay * months
    return {
      totalTax: total,
      breakdown: [
        { label: 'Penghasilan Harian', variant: 'section' },
        { label: 'Upah harian', value: input.brutoMonthly },
        { label: 'Tarif TER harian', value: terRate, valueType: 'percent' },
        { label: 'PPh 21 per hari', value: taxPerDay },
        { label: 'Total masa', value: total, variant: 'total' },
      ],
    }
  }

  if (input.brutoMonthly <= 2500000) {
    const terRate = getTerBulananRate(input.terCategory, input.brutoMonthly)
    const masaTax = input.brutoMonthly * terRate
    return {
      totalTax: masaTax * months,
      breakdown: [
        { label: 'Penghasilan', variant: 'section' },
        { label: 'Bruto bulanan', value: input.brutoMonthly },
        { label: 'Tarif TER', value: terRate, valueType: 'percent' },
        { label: 'PPh 21 per masa', value: masaTax },
        { label: 'Total masa', value: masaTax * months, variant: 'total' },
      ],
    }
  }

  const dpp = 0.5 * input.brutoMonthly
  const pajakMasa = hitungPajakPasal17(dpp)
  const totalTax = pajakMasa * months

  return {
    totalTax,
    breakdown: [
      { label: 'Penghasilan', variant: 'section' },
      { label: 'Bruto bulanan', value: input.brutoMonthly },
      { label: 'DPP (50% bruto)', value: dpp },
      { label: 'PPh 21 per masa', value: pajakMasa },
      { label: 'Total', value: totalTax, variant: 'total' },
    ],
  }
}

function calculateBukanPegawai(input: PPh21Input): TaxResult {
  const bruto = input.brutoMonthly * input.monthsPaid + input.bonusAnnual
  const dpp = bruto * 0.5
  const tax = hitungPajakPasal17(dpp)
  return {
    totalTax: tax,
    breakdown: [
      { label: 'Penghasilan', variant: 'section' },
      { label: 'Bruto', value: bruto },
      { label: 'DPP (50% bruto)', value: dpp },
      { label: 'PPh 21 final', value: tax, variant: 'total' },
    ],
  }
}

function flatPasal17(input: PPh21Input, heading: string): TaxResult {
  const bruto = input.brutoMonthly * input.monthsPaid + input.bonusAnnual
  const tax = hitungPajakPasal17(bruto)
  return {
    totalTax: tax,
    breakdown: [
      { label: heading, variant: 'section' },
      { label: 'Penghasilan bruto', value: bruto },
      { label: 'DPP', value: bruto },
      { label: 'PPh 21 final', value: tax, variant: 'total' },
    ],
  }
}

const integerFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

function formatNumber(value: number) {
  return integerFormatter.format(Math.round(value))
}

function formatPercentLabel(rate: number) {
  const percent = rate * 100
  return percent % 1 === 0 ? `${percent.toFixed(0)}%` : `${percent.toFixed(2)}%`
}

function buildPasal17TierRows(pkpRounded: number): TaxBreakdownRow[] {
  let remaining = pkpRounded
  let lowerBound = 0
  const layers: TaxBreakdownRow[] = []
  PASAL17_LAYERS.forEach((layer, index) => {
    if (remaining <= 0) {
      return
    }
    const taxable = Math.min(remaining, layer.limit)
    if (taxable <= 0) return
    const upperBound = lowerBound + taxable
    layers.push({
      label: `Tier ${index + 1}: ${formatPercentLabel(layer.rate)} × ${formatNumber(
        taxable,
      )}`,
      value: taxable * layer.rate,
      note: `Lapisan PKP ${formatNumber(lowerBound)} – ${formatNumber(upperBound)}`,
    })
    remaining -= taxable
    lowerBound += layer.limit
  })
  return layers
}

function buildWaterfallTerRows({
  months,
  salaryAnnual,
  allowanceAnnual,
  brutoTahun,
  biayaJabatan,
  iuranTahun,
  zakat,
  nettoSetahun,
  ptkp,
  pkpRounded,
  pasal17Rows,
  pajakSetahun,
  terRate,
  masaTax,
  terPaid,
  terMonths,
  adjustment,
  overpaid,
  takeHomeAnnual,
  takeHomePerMasa,
}: {
  months: number
  salaryAnnual: number
  allowanceAnnual: number
  brutoTahun: number
  biayaJabatan: number
  iuranTahun: number
  zakat: number
  nettoSetahun: number
  ptkp: number
  pkpRounded: number
  pasal17Rows: TaxBreakdownRow[]
  pajakSetahun: number
  terRate: number
  masaTax: number
  terPaid: number
  terMonths: number
  adjustment: number
  overpaid: number
  takeHomeAnnual: number
  takeHomePerMasa: number
}): TaxBreakdownRow[] {
  const rows: TaxBreakdownRow[] = []
  const totalPengurang = biayaJabatan + iuranTahun + zakat

  rows.push({ label: 'A. Penghasilan Bruto (Gross)', variant: 'group' })
  rows.push({
    label: 'Gaji pokok (setahun)',
    value: salaryAnnual,
    note: `Estimasi ${months} masa`,
  })
  rows.push({
    label: 'Tunjangan/bonus (setahun)',
    value: allowanceAnnual,
    note: 'Tunjangan tetap / bonus / THR',
  })
  rows.push({
    label: 'Total bruto setahun',
    value: brutoTahun,
    variant: 'subtotal',
    note: 'Total penghasilan kotor',
  })
  rows.push({ label: '', variant: 'spacer' })

  rows.push({ label: 'B. Pengurang (Deductions)', variant: 'group' })
  rows.push({
    label: 'Biaya jabatan',
    value: -biayaJabatan,
    note: '5% × bruto, maks 6 juta/tahun',
  })
  rows.push({
    label: 'Iuran pensiun/JHT',
    value: -iuranTahun,
    note: 'Bagian yang dibayar karyawan',
  })
  if (zakat > 0) {
    rows.push({
      label: 'Zakat/sumbangan',
      value: -zakat,
      note: 'Melalui pemberi kerja',
    })
  }
  rows.push({
    label: 'Total pengurang',
    value: -totalPengurang,
    variant: 'subtotal',
  })
  rows.push({ label: '', variant: 'spacer' })

  rows.push({ label: 'C. Basis Perhitungan Pajak', variant: 'group' })
  rows.push({
    label: 'Penghasilan netto',
    value: nettoSetahun,
    note: 'Bruto - Pengurang',
  })
  rows.push({
    label: 'PTKP',
    value: -ptkp,
    note: 'Berdasarkan status keluarga',
  })
  rows.push({
    label: 'PKP (dibulatkan)',
    value: pkpRounded,
    variant: 'subtotal',
  })
  rows.push({ label: '', variant: 'spacer' })

  rows.push({
    label: 'D. Pajak terutang (tarif Pasal 17)',
    variant: 'group',
  })
  rows.push(
    ...pasal17Rows.map((tier) => ({
      ...tier,
      note: tier.note,
    })),
  )
  rows.push({
    label: 'Total PPh 21 seharusnya (setahun)',
    value: pajakSetahun,
    variant: 'subtotal',
    note: 'Kewajiban pajak 1 tahun',
  })
  rows.push({ label: '', variant: 'spacer' })

  rows.push({ label: 'E. Status pembayaran (Settlement)', variant: 'group' })
  rows.push({
    label: 'PPh 21 TER per masa',
    value: masaTax,
    note: `Tarif ${formatPercentLabel(terRate)} × bruto per masa`,
  })
  rows.push({
    label: '(-) Sudah dipotong Jan–Nov (TER)',
    value: -terPaid,
    note: `Tarif ${formatPercentLabel(terRate)} × ${terMonths} masa`,
  })
  if (overpaid > 0) {
    rows.push({
      label: 'Kelebihan TER',
      value: overpaid,
      note: 'TER melebihi hasil Pasal 17',
    })
  }
  rows.push({
    label: 'PPh 21 masa Desember (kurang bayar)',
    value: adjustment,
    variant: 'total',
    note: 'Sisa kewajiban Desember',
  })
  rows.push({ label: '', variant: 'spacer' })

  rows.push({ label: 'F. Take-home pay', variant: 'group' })
  rows.push({
    label: 'Take-home setahun',
    value: takeHomeAnnual,
    note: 'Bruto - pajak terutang',
  })
  rows.push({
    label: 'Take-home per masa',
    value: takeHomePerMasa,
    note: `${months} masa`,
  })

  return rows
}

function calculatePph26(input: PPh21Input): TaxResult {
  const bruto = input.brutoMonthly * input.monthsPaid + input.bonusAnnual
  const rate = input.foreignTaxRate || 0.2
  const tax = bruto * rate
  return {
    totalTax: tax,
    breakdown: [
      { label: 'Penghasilan Bruto', variant: 'section' },
      { label: 'Penghasilan bruto', value: bruto },
      { label: 'Tarif PPh 26', value: rate, valueType: 'percent' },
      { label: 'PPh 26 final', value: tax, variant: 'total' },
    ],
  }
}
