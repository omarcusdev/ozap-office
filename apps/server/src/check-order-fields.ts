import "dotenv/config"
import { config } from "./config.js"

const checkOrderFields = async () => {
  const tokenRes = await fetch("https://api.cakto.com.br/public_api/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.caktoClientId,
      client_secret: config.caktoClientSecret,
    }),
  })
  const tokenData = await tokenRes.json() as { access_token: string }

  const ordersRes = await fetch(
    "https://api.cakto.com.br/public_api/orders/?limit=2&status=paid&ordering=-createdAt",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  )
  const ordersData = await ordersRes.json() as { results: Record<string, unknown>[] }

  console.log("=== ALL FIELDS IN A PAID ORDER ===")
  console.log(JSON.stringify(ordersData.results[0], null, 2))
  console.log("\n=== ALL KEYS ===")
  console.log(Object.keys(ordersData.results[0]).join(", "))
}

checkOrderFields().catch(console.error)
