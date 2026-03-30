import postgres from "postgres"
import { config } from "../config.js"

const createConnection = () => {
  if (!config.zapGptDatabaseUrl) return null

  return postgres(config.zapGptDatabaseUrl, {
    ssl: "require",
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
  })
}

const sql = createConnection()

const assertConnection = () => {
  if (!sql) {
    throw new Error("ZAP_GPT_DATABASE_URL not configured")
  }
  return sql
}

export const zapGptQuery = async <T extends postgres.MaybeRow[]>(
  queryFn: (sql: postgres.Sql) => Promise<T>
): Promise<T> => {
  const connection = assertConnection()
  return queryFn(connection)
}
