import { twitterClient } from "../integrations/twitter-client.js"
import { db } from "../db/client.js"
import { agentMemories } from "../db/schema.js"
import { eq, and, desc } from "drizzle-orm"

type ToolResult = { content: string; isError?: boolean }

const NOT_CONFIGURED_MSG = "Twitter API not configured. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET env vars."

const postTweet = async (_agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  if (!twitterClient) return { content: NOT_CONFIGURED_MSG, isError: true }

  const text = input.text as string | undefined
  if (!text) return { content: "text is required", isError: true }
  if (text.length > 280) return { content: `Tweet has ${text.length} chars, max is 280. Shorten it.`, isError: true }

  const replyToId = input.replyToId as string | undefined

  try {
    const params: Record<string, unknown> = {}
    if (replyToId) {
      params.reply = { in_reply_to_tweet_id: replyToId }
    }

    const result = await twitterClient.v2.tweet(text, params)
    return {
      content: JSON.stringify({
        success: true,
        tweetId: result.data.id,
        url: `https://x.com/i/status/${result.data.id}`,
      }),
    }
  } catch (error) {
    return { content: `Failed to post tweet: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getRecentTweets = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const limit = (input.limit as number) ?? 10

  if (twitterClient) {
    try {
      const me = await twitterClient.v2.me()
      const timeline = await twitterClient.v2.userTimeline(me.data.id, {
        max_results: Math.min(Math.max(limit, 5), 100),
        "tweet.fields": ["created_at", "public_metrics"],
      })

      const tweets = timeline.data.data?.map((t) => ({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        metrics: t.public_metrics,
      })) ?? []

      return { content: JSON.stringify({ source: "api", tweets }) }
    } catch {
    }
  }

  const archived = await db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        eq(agentMemories.type, "archival"),
        eq(agentMemories.category, "posted_tweet")
      )
    )
    .orderBy(desc(agentMemories.createdAt))
    .limit(limit)

  const tweets = archived.map((m) => ({
    text: m.content,
    createdAt: m.createdAt,
  }))

  return { content: JSON.stringify({ source: "memory", tweets }) }
}

const getMentions = async (_agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  if (!twitterClient) {
    return { content: JSON.stringify({ mentions: [], fallbackReason: NOT_CONFIGURED_MSG }) }
  }

  const limit = (input.limit as number) ?? 20

  try {
    const me = await twitterClient.v2.me()
    const mentions = await twitterClient.v2.userMentionTimeline(me.data.id, {
      max_results: Math.min(Math.max(limit, 5), 100),
      "tweet.fields": ["created_at", "author_id", "conversation_id"],
    })

    const items = mentions.data.data?.map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      createdAt: t.created_at,
    })) ?? []

    return { content: JSON.stringify({ mentions: items }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("403") || message.includes("Forbidden")) {
      return {
        content: JSON.stringify({
          mentions: [],
          fallbackReason: "API read access not available. Upgrade to Basic tier to enable engagement.",
        }),
      }
    }
    return { content: `Failed to get mentions: ${message}`, isError: true }
  }
}

export const executeTwitterTool = async (
  agentId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (agentId: string, input: Record<string, unknown>) => Promise<ToolResult>> = {
    postTweet,
    getRecentTweets,
    getMentions,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown twitter tool: ${toolName}`, isError: true }

  return handler(agentId, input)
}
