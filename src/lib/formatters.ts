const nonDigitsRegex = /\D+/g

export function onlyDigits(value: string) {
  return value.replace(nonDigitsRegex, "")
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)

  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 9)
  const part4 = digits.slice(9, 11)

  if (digits.length <= 3) return part1
  if (digits.length <= 6) return `${part1}.${part2}`
  if (digits.length <= 9) return `${part1}.${part2}.${part3}`
  return `${part1}.${part2}.${part3}-${part4}`
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14)

  const part1 = digits.slice(0, 2)
  const part2 = digits.slice(2, 5)
  const part3 = digits.slice(5, 8)
  const part4 = digits.slice(8, 12)
  const part5 = digits.slice(12, 14)

  if (digits.length <= 2) return part1
  if (digits.length <= 5) return `${part1}.${part2}`
  if (digits.length <= 8) return `${part1}.${part2}.${part3}`
  if (digits.length <= 12) return `${part1}.${part2}.${part3}/${part4}`
  return `${part1}.${part2}.${part3}/${part4}-${part5}`
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8)

  const part1 = digits.slice(0, 5)
  const part2 = digits.slice(5, 8)

  if (digits.length <= 5) return part1
  return `${part1}-${part2}`
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)

  if (digits.length <= 2) return digits

  const part1 = digits.slice(0, 2)
  const remaining = digits.slice(2)

  if (remaining.length <= 4) {
    return `(${part1}) ${remaining}`
  }

  if (remaining.length <= 8) {
    const part2 = remaining.slice(0, 4)
    const part3 = remaining.slice(4)
    return `(${part1}) ${part2}-${part3}`
  }

  const part2 = remaining.slice(0, 5)
  const part3 = remaining.slice(5)
  return `(${part1}) ${part2}-${part3}`
}
