import { formatCurrency } from '../lib/format'
import { Card, CardTitle } from './ui/card'

interface TaxSummaryCardProps {
  total: number
  label?: string
  meta?: string
  terPerPeriod?: number
  decemberAdjustment?: number
  takeHomeAnnual?: number
  takeHomePerPeriod?: number
  takeHomePeriodLabel?: string
}

export function TaxSummaryCard({
  total,
  label,
  terPerPeriod,
  decemberAdjustment,
  takeHomeAnnual,
  takeHomePerPeriod,
  takeHomePeriodLabel = 'per masa',
}: TaxSummaryCardProps) {
  return (
    <Card className="border border-[#f6ce7d]/60 bg-gradient-to-br from-[#fffaf2] to-[#fff4d8] p-5 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2 text-sm text-[#0f1e3d]">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-[#967000]">
            {label ?? 'Rangkuman Pajak'}
          </CardTitle>
          <div className="space-y-2">
            <SummaryRow label="Total PPh 21/26" value={total} />
            {typeof terPerPeriod === 'number' && (
              <SummaryRow label="TER per masa" value={terPerPeriod} />
            )}
            {typeof decemberAdjustment === 'number' && (
              <SummaryRow label="Selisih Desember" value={decemberAdjustment} />
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm text-[#0f1e3d]">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-[#967000]">
            Take-home pay
          </CardTitle>
          <div className="space-y-2">
            {typeof takeHomeAnnual === 'number' && (
              <SummaryRow
                label="THP setahun"
                value={takeHomeAnnual}
                suffix="per tahun"
              />
            )}
            {typeof takeHomePerPeriod === 'number' && (
              <SummaryRow
                label="THP per masa"
                value={takeHomePerPeriod}
                suffix={takeHomePeriodLabel}
              />
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function SummaryRow({
  label,
  value,
  suffix,
}: {
  label: string
  value: number
  suffix?: string
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#f6ce7d]/60 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5f4400]">
      <span>{label}</span>
      <span className="text-[#0f1e3d] tracking-normal">
        {formatCurrency(value)}{' '}
        {suffix && <span className="text-[10px] uppercase text-[#0f1e3d]/60">{suffix}</span>}
      </span>
    </div>
  )
}
