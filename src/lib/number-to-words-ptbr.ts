export function numberToWordsPtBr(value: number): string {
  const units = [
    "",
    "um",
    "dois",
    "tres",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
  ]
  const teens = [
    "dez",
    "onze",
    "doze",
    "treze",
    "quatorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
  ]
  const tens = [
    "",
    "dez",
    "vinte",
    "trinta",
    "quarenta",
    "cinquenta",
    "sessenta",
    "setenta",
    "oitenta",
    "noventa",
  ]
  const hundreds = [
    "",
    "cento",
    "duzentos",
    "trezentos",
    "quatrocentos",
    "quinhentos",
    "seiscentos",
    "setecentos",
    "oitocentos",
    "novecentos",
  ]

  const scaleSingular = ["", "mil", "milhao", "bilhao", "trilhao"]
  const scalePlural = ["", "mil", "milhoes", "bilhoes", "trilhoes"]

  const toWordsBelowThousand = (n: number) => {
    if (n === 0) return ""
    if (n === 100) return "cem"

    const h = Math.floor(n / 100)
    const r = n % 100
    let result = ""

    if (h > 0) result += hundreds[h]

    if (r > 0) {
      if (result) result += " e "

      if (r < 10) {
        result += units[r]
      } else if (r < 20) {
        result += teens[r - 10]
      } else {
        const t = Math.floor(r / 10)
        const u = r % 10
        result += tens[t]
        if (u > 0) result += ` e ${units[u]}`
      }
    }

    return result
  }

  const absValue = Math.floor(Math.abs(value))
  if (absValue === 0) return "zero real"

  const groups: Array<{ value: number; index: number; text: string }> = []
  let remaining = absValue
  let index = 0

  while (remaining > 0) {
    const groupValue = remaining % 1000
    if (groupValue > 0) {
      let groupText = toWordsBelowThousand(groupValue)

      if (index === 1) {
        groupText = groupValue === 1 ? "mil" : `${groupText} mil`
      } else if (index >= 2) {
        if (groupValue === 1) {
          groupText = `um ${scaleSingular[index]}`
        } else {
          groupText = `${groupText} ${scalePlural[index]}`
        }
      }

      groups.push({ value: groupValue, index, text: groupText })
    }

    remaining = Math.floor(remaining / 1000)
    index += 1
  }

  groups.reverse()

  const shouldUseE = (nextValue: number) => nextValue < 100 || nextValue % 100 === 0

  let words = ""
  for (let i = 0; i < groups.length; i += 1) {
    const current = groups[i]
    words += current.text

    const next = groups[i + 1]
    if (next) {
      words += shouldUseE(next.value) ? " e " : " "
    }
  }

  const useDe = absValue >= 1_000_000 && absValue % 1_000_000 === 0

  if (absValue === 1) return "um real"

  return `${words} ${useDe ? "de " : ""}reais`
}
