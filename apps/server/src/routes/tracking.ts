import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { pageViews } from "../db/schema.js"

const parseReferrerSource = (referrer: string | null | undefined): string => {
  if (!referrer) return "direct"

  try {
    const hostname = new URL(referrer).hostname.toLowerCase()
    if (hostname.includes("instagram")) return "instagram"
    if (hostname.includes("facebook") || hostname.includes("fb.com")) return "facebook"
    if (hostname.includes("google")) return "google"
    if (hostname.includes("youtube")) return "youtube"
    if (hostname.includes("tiktok")) return "tiktok"
    if (hostname.includes("whatsapp") || hostname.includes("wa.me")) return "whatsapp"
    if (hostname.includes("twitter") || hostname.includes("t.co") || hostname.includes("x.com")) return "twitter"
    if (hostname.includes("linkedin")) return "linkedin"
    if (hostname.includes("bing")) return "bing"
    if (hostname.includes("chatgpt")) return "chatgpt"
    return hostname.replace("www.", "")
  } catch {
    return "unknown"
  }
}

export const registerTrackingRoutes = (server: FastifyInstance) => {
  server.post<{
    Body: {
      site: string
      path: string
      referrer?: string
      utm_source?: string
      utm_medium?: string
      utm_campaign?: string
      utm_content?: string
      utm_term?: string
      fbclid?: string
      gclid?: string
      ttclid?: string
      msclkid?: string
      first_touch?: Record<string, unknown>
      screen_width?: number
      session_id?: string
    }
  }>("/api/track", async (request, reply) => {
    const body = request.body as any
    if (!body?.site || !body?.path) {
      return reply.code(400).send({ error: "site and path required" })
    }

    const referrerSource = body.utm_source || parseReferrerSource(body.referrer)

    await db.insert(pageViews).values({
      site: body.site,
      pagePath: body.path,
      referrer: body.referrer || null,
      referrerSource,
      utmSource: body.utm_source || null,
      utmMedium: body.utm_medium || null,
      utmCampaign: body.utm_campaign || null,
      utmContent: body.utm_content || null,
      utmTerm: body.utm_term || null,
      fbclid: body.fbclid || null,
      gclid: body.gclid || null,
      ttclid: body.ttclid || null,
      msclkid: body.msclkid || null,
      firstTouch: body.first_touch ?? null,
      screenWidth: body.screen_width || null,
      sessionId: body.session_id || null,
    })

    return { ok: true }
  })

  server.get("/api/track/pixel.gif", async (request, reply) => {
    const GIF_1X1 = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
    return reply.header("content-type", "image/gif").header("cache-control", "no-store").send(GIF_1X1)
  })
}
