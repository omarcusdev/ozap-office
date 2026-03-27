const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  apiKey: requireEnv("OZAP_OFFICE_API_KEY"),
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  port: Number(process.env.PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  caktoClientId: process.env.CAKTO_CLIENT_ID ?? "",
  caktoClientSecret: process.env.CAKTO_CLIENT_SECRET ?? "",
  metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN ?? "",
  metaAdsAccountId: process.env.META_ADS_ACCOUNT_ID ?? "",
  metaAdsAppId: process.env.META_ADS_APP_ID ?? "",
  metaAdsAppSecret: process.env.META_ADS_APP_SECRET ?? "",
  adsDailyBudgetLimit: Number(process.env.ADS_DAILY_BUDGET_LIMIT ?? 100),
}
