import { useMemo, useState } from 'react'
import { Banner, Button } from '@/components/ui/core'
import { NumberInput, Select } from '@/components/ui/form'
import { Modal } from '@/components/ui/overlay'
import { balancePoint, btuHrPerDegree, HP_OUTPUTS, sizingTable } from '@sd/domain/sizing'

/** Heat pump sizing check (from Retool's Heat Hero module): what the heat pump delivers at each outdoor temperature against what the home needs. */
export function SizingDialog({ open, onClose, sqFootage }: { open: boolean; onClose: () => void; sqFootage: number | null }) {
  const [model, setModel] = useState(HP_OUTPUTS[1]!.model)
  const [load, setLoad] = useState('')
  const [designTemp, setDesignTemp] = useState('')
  const [setTemp, setSetTemp] = useState('70')
  const [deration, setDeration] = useState('100')

  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const ready = num(load) !== null && num(designTemp) !== null && num(setTemp) !== null
  const per = ready ? btuHrPerDegree(num(load)!, num(setTemp)!, num(designTemp)!) : 0
  const rows = useMemo(() => (ready ? sizingTable({ model, deration: (num(deration) ?? 100) / 100, setTemp: num(setTemp)!, btuHrDeg: per }) : []), [ready, model, deration, setTemp, per]) // eslint-disable-line react-hooks/exhaustive-deps
  const bp = rows.length ? balancePoint(rows) : null
  const atDesign = rows.length ? rows.reduce((best, r) => (Math.abs(r.temperature - num(designTemp)!) < Math.abs(best.temperature - num(designTemp)!) ? r : best)) : null

  // one scale for both lines
  const W = 560, H = 240, L = 46, B = 30, T = 12, Rr = 14
  const temps = rows.map((r) => r.temperature)
  const ymax = rows.length ? Math.ceil(Math.max(...rows.map((r) => Math.max(r.hp_output, r.heating_need))) / 10) * 10 : 10
  const x = (t: number) => L + ((t - Math.min(...temps)) / (Math.max(...temps) - Math.min(...temps) || 1)) * (W - L - Rr)
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  const path = (k: 'hp_output' | 'heating_need') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.temperature).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(ymax * f))

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Heat pump sizing check" description="Heat pump output against the heating the home needs, by outdoor temperature." size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        <div className="grid grid-cols-12 gap-x-4 gap-y-3">
          <Select wrapperClassName="col-span-12 sm:col-span-6" label="Heat pump" options={HP_OUTPUTS.map((h) => h.model)} value={model} onChange={(e) => setModel(e.target.value)} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Heating design load" suffix="BTU/hr" min={0} value={load} onChange={(e) => setLoad(e.target.value)} hint="From the Manual J" />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Design temperature" suffix="°F" value={designTemp} onChange={(e) => setDesignTemp(e.target.value)} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Indoor set temperature" suffix="°F" value={setTemp} onChange={(e) => setSetTemp(e.target.value)} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Deration" suffix="%" min={1} max={100} value={deration} onChange={(e) => setDeration(e.target.value)} hint="Ducts, altitude, defrost" />
          {sqFootage ? (
            <div className="col-span-12 flex items-end sm:col-span-6">
              <Button size="sm" onClick={() => setLoad(String(Math.round(sqFootage * 25)))}>Use a rough estimate ({(sqFootage * 25).toLocaleString()} BTU/hr)</Button>
            </div>
          ) : null}
        </div>

        {!ready ? (
          <Banner tone="info" title="Enter the heating design load and design temperature">The chart shows once both are filled in. The rough estimate button uses 25 BTU/hr per square foot, which is only a placeholder until the Manual J is done.</Banner>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Home needs</p><p className="num text-[20px] font-bold">{per.toFixed(0)} <span className="text-[13px] font-medium text-ink-3">BTU/hr per °F</span></p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Balance point</p><p className="num text-[20px] font-bold">{bp !== null ? `${bp}°F` : rows.every((r) => r.hp_output >= r.heating_need) ? 'Covers all' : 'Below range'}</p></div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">At {atDesign?.temperature}°F</p>
                <p className="num text-[20px] font-bold">{atDesign ? `${Math.round((atDesign.hp_output / Math.max(atDesign.heating_need, 0.1)) * 100)}%` : '—'} <span className="text-[13px] font-medium text-ink-3">of the need</span></p>
              </div>
            </div>

            <figure>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Heat pump output and heating need by outdoor temperature">
                {ticks.map((t) => (<g key={t}><line x1={L} x2={W - Rr} y1={y(t)} y2={y(t)} stroke="var(--color-line)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-3)">{t}</text></g>))}
                {temps.map((t) => (<text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)">{t}°</text>))}
                <path d={path('heating_need')} fill="none" stroke="var(--color-warn)" strokeWidth="2.5" />
                <path d={path('hp_output')} fill="none" stroke="var(--color-brand-600)" strokeWidth="2.5" />
                {rows.map((r) => (<g key={r.temperature}><circle cx={x(r.temperature)} cy={y(r.hp_output)} r="3" fill="var(--color-brand-600)" /><circle cx={x(r.temperature)} cy={y(r.heating_need)} r="3" fill="var(--color-warn)" /></g>))}
                <text x={L} y={T + 2} fontSize="11" fill="var(--color-ink-3)">MBH</text>
              </svg>
              <figcaption className="mt-1 flex flex-wrap gap-4 text-[13px] text-ink-2">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 bg-brand-600" /> Heat pump output</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 bg-warn" /> Heating need</span>
              </figcaption>
            </figure>

            <div className="overflow-x-auto">
              <table className="num w-full min-w-[420px] text-[13.5px]">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1.5 pr-4 font-semibold">Outdoor</th><th className="py-1.5 pr-4 text-right font-semibold">Heat pump</th><th className="py-1.5 pr-4 text-right font-semibold">Need</th><th className="py-1.5 text-right font-semibold">Covers</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.temperature} className="border-t border-line"><td className="py-1.5 pr-4">{r.temperature}°F</td><td className="py-1.5 pr-4 text-right">{r.hp_output} MBH</td><td className="py-1.5 pr-4 text-right">{r.heating_need} MBH</td>
                    <td className={`py-1.5 text-right font-semibold ${r.hp_output >= r.heating_need ? 'text-ok' : 'text-warn'}`}>{r.hp_output >= r.heating_need ? 'Yes' : `${Math.round((r.hp_output / Math.max(r.heating_need, 0.1)) * 100)}%`}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-[12.5px] text-ink-3">Output figures are Retool's table for these Mitsubishi models. Retool also estimates the home's BTU/hr per degree from utility bills through a sizing service; that service is not connected here, so it comes from the design load you enter.</p>
      </div>
    </Modal>
  )
}
