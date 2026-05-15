import "dotenv/config"
import { syncRevenue } from "../src/ingestion/revenue-sync.js"

const main = async () => {
  const results = await syncRevenue()
  console.log("Sync results:")
  for (const r of results) {
    console.log(`  ${r.source}: inserted=${r.inserted} skipped=${r.skipped}${r.error ? ` ERROR=${r.error}` : ""}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("Sync failed:", err)
  process.exit(1)
})
