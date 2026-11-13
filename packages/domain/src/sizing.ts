/* Heat pump sizing check. Port of the Heat Hero module's hpOutputs.js and sizing chart table: for each outdoor temperature, what the heat pump delivers (rated output at that
   temperature, times a deration factor) against what the home needs ((set temperature - outdoor temperature) x BTU per hour per degree). Where the two lines cross is the balance point.
   The Retool module gets the home's BTU/hr per degree from an external sizing service; here it comes from the heating design load and design temperature. */

/** Heat pump output in BTU/hr by outdoor temperature in F. Copied from Retool (hpOutputs.js). */
export const HP_OUTPUTS: { model: string; outputs: Record<string, number> }[] = [
  { model: "PUZ-HA24NHA1 / PVA-A24AA7", outputs: {"0":24556,"5":26000,"10":26238,"15":26476,"20":26714,"25":26952,"-20":18778,"-15":20222,"-10":21667,"-5":23111} },
  { model: "PUZ-HA30NKA / PVA-A30AA7", outputs: {"0":30222,"5":32000,"10":32238,"15":32476,"20":32714,"25":32952,"-20":23111,"-15":24889,"-10":26667,"-5":28444} },
  { model: "PUZ-HA36NKA / PVA-A36AA7", outputs: {"0":35889,"5":38000,"10":38238,"15":38476,"20":38714,"25":38952,"-20":27444,"-15":29556,"-10":31667,"-5":33778} },
  { model: "PUZ-HA42NKA / PVA-A42AA7", outputs: {"0":45333,"5":48000,"10":48714,"15":49429,"20":50143,"25":50857,"-20":34667,"-15":37333,"-10":40000,"-5":42667} },
  { model: "MXZ-SM36NAMHZ2 / PVFY-P36", outputs: {"0":39083,"5":42000,"10":42000,"15":42000,"20":42000,"25":42000,"-20":27417,"-15":30333,"-10":33250,"-5":36167} },
  { model: "MXZ-SM42NAMHZ2 / PVFY-P48", outputs: {"0":44667,"5":48000,"10":48000,"15":48000,"20":48000,"25":48000,"-20":31333,"-15":34667,"-10":38000,"-5":41333} },
  { model: "MXZ-SM48NAMHZ2 / PVFY-P48", outputs: {"0":50250,"5":54000,"10":54000,"15":54000,"20":54000,"25":54000,"-20":35250,"-15":39000,"-10":42750,"-5":46500} },
]

export interface SizingRow { temperature: number; hp_output: number; heating_need: number; index: number }

/** Retool's table: values in MBH (BTU/hr / 1000), one decimal, sorted from the coldest temperature. */
export function sizingTable(args: { model: string; deration: number; setTemp: number; btuHrDeg: number }): SizingRow[] {
  const entry = HP_OUTPUTS.find((h) => h.model === args.model)
  if (!entry) return []
  return Object.entries(entry.outputs)
    .map(([temperature, output]) => ({
      temperature: Number(temperature),
      hp_output: Number(((output * args.deration) / 1000).toFixed(1)),
      heating_need: Number((((args.setTemp - Number(temperature)) * args.btuHrDeg) / 1000).toFixed(1)),
    }))
    .sort((a, b) => a.temperature - b.temperature)
    .map((r, index) => ({ ...r, index }))
}

/** BTU/hr per degree F from the heating design load and the design temperature (the load is what the home needs at the design temperature). */
export const btuHrPerDegree = (designLoadBtuh: number, setTemp: number, designTemp: number) => (setTemp - designTemp > 0 ? designLoadBtuh / (setTemp - designTemp) : 0)

/** The outdoor temperature at which the heat pump output stops covering the need (linear between table points). Null when it covers everything or nothing in the range. */
export function balancePoint(rows: SizingRow[]): number | null {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!, b = rows[i + 1]!
    const da = a.hp_output - a.heating_need, db = b.hp_output - b.heating_need
    if (da < 0 && db >= 0) return Number((a.temperature + ((0 - da) / (db - da)) * (b.temperature - a.temperature)).toFixed(1))
  }
  return null
}
