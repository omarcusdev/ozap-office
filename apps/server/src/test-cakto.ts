import "dotenv/config"
import { config } from "./config.js"

const testCakto = async () => {
  console.log("ClientID:", config.caktoClientId ? "SET" : "EMPTY")
  console.log("Secret:", config.caktoClientSecret ? "SET" : "EMPTY")

  const tokenRes = await fetch("https://api.cakto.com.br/public_api/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.caktoClientId,
      client_secret: config.caktoClientSecret,
    }),
  })

  console.log("Token HTTP:", tokenRes.status)
  const tokenData = await tokenRes.json() as Record<string, unknown>
  console.log("Token keys:", Object.keys(tokenData))

  if (!tokenData.access_token) {
    console.log("Token body:", JSON.stringify(tokenData))
    return
  }

  const token = tokenData.access_token as string
  console.log("Token:", token.substring(0, 20) + "...")

  const ordersRes = await fetch("https://api.cakto.com.br/public_api/orders/?limit=1", {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log("Orders HTTP:", ordersRes.status)
  const ordersBody = await ordersRes.text()
  console.log("Orders body:", ordersBody.substring(0, 400))

  const productsRes = await fetch("https://api.cakto.com.br/public_api/products/?limit=1", {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log("Products HTTP:", productsRes.status)
  const productsBody = await productsRes.text()
  console.log("Products body:", productsBody.substring(0, 400))
}

testCakto().catch(console.error)
