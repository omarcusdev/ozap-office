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

const TWEET_ID_REGEX = /id:\s*(\d{15,25})/

const extractTweetId = (content: string): string | null => {
  const match = content.match(TWEET_ID_REGEX)
  return match ? match[1] : null
}

const daysSince = (date: Date): number => {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

const getRecentTweets = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const limit = (input.limit as number) ?? 10

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

  const memoryTweets = archived.map((m) => ({
    memoryContent: m.content,
    createdAt: m.createdAt,
    tweetId: extractTweetId(m.content),
    daysAgo: daysSince(m.createdAt),
  }))

  const ids = memoryTweets.map((t) => t.tweetId).filter((id): id is string => id !== null)

  if (!twitterClient || ids.length === 0) {
    return {
      content: JSON.stringify({
        source: "memory",
        note: "metrics unavailable",
        tweets: memoryTweets.map(({ memoryContent, daysAgo }) => ({ memoryContent, daysAgo })),
      }),
    }
  }

  try {
    const metricsResponse = await twitterClient.v2.tweets(ids, {
      "tweet.fields": ["public_metrics", "created_at"],
    })

    const metricsById = new Map<string, { impressions: number; likes: number; replies: number; retweets: number; bookmarks: number }>()
    for (const tweet of metricsResponse.data ?? []) {
      const m = tweet.public_metrics
      if (!m) continue
      metricsById.set(tweet.id, {
        impressions: (m as { impression_count?: number }).impression_count ?? 0,
        likes: m.like_count ?? 0,
        replies: m.reply_count ?? 0,
        retweets: m.retweet_count ?? 0,
        bookmarks: (m as { bookmark_count?: number }).bookmark_count ?? 0,
      })
    }

    const enriched = memoryTweets.map((t) => ({
      memoryContent: t.memoryContent,
      daysAgo: t.daysAgo,
      tweetId: t.tweetId,
      metrics: t.tweetId ? metricsById.get(t.tweetId) ?? null : null,
    }))

    const withImpressions = enriched.filter((t) => t.metrics !== null)
    const totalImpressions = withImpressions.reduce((sum, t) => sum + (t.metrics?.impressions ?? 0), 0)
    const avgImpressions = withImpressions.length > 0 ? Math.round(totalImpressions / withImpressions.length) : 0

    const sorted = [...enriched].sort((a, b) => (b.metrics?.impressions ?? -1) - (a.metrics?.impressions ?? -1))

    return {
      content: JSON.stringify({
        source: "api+memory",
        avgImpressions,
        instruction: "tweets sao ordenados por impressoes (maior primeiro). estude o hook dos top 3 — o que eles tem em comum? replique o padrao. tweets abaixo da media: identifique o erro e nao repita.",
        tweets: sorted,
      }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: JSON.stringify({
        source: "memory",
        fallbackReason: message.includes("403") || message.includes("Forbidden")
          ? "API read access not available"
          : `metrics fetch failed: ${message}`,
        tweets: memoryTweets.map(({ memoryContent, daysAgo }) => ({ memoryContent, daysAgo })),
      }),
    }
  }
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
