import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"
import { config } from "../config.js"

const connection = postgres(config.databaseUrl)

export const db = drizzle(connection, { schema })
