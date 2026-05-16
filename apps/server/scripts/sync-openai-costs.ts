import "dotenv/config"
import { syncOpenAICosts } from "../src/ingestion/openai-cost-sync.js"

const main = async () => {
  const result = await syncOpenAICosts()
  console.log("OpenAI cost sync:")
  console.log(`  inserted=${result.inserted} skipped=${result.skipped}${result.error ? ` ERROR=${result.error}` : ""}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("OpenAI cost sync failed:", err)
  process.exit(1)
})
