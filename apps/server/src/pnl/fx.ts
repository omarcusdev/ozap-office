export const usdToBrl = (amountUsdCents: number): number => {
  const raw = process.env.USD_TO_BRL
  if (!raw) throw new Error("USD_TO_BRL env var required for USD entries")
  const rate = Number(raw)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`USD_TO_BRL invalid: ${raw}`)
  }
  return Math.round(amountUsdCents * rate)
}

export const toBrlCents = (amountCents: number, currency: "BRL" | "USD"): number =>
  currency === "BRL" ? amountCents : usdToBrl(amountCents)
