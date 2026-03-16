import { db } from "../db/client.js"
import { agentMemories } from "../db/schema.js"
import { eq, and, ilike } from "drizzle-orm"

type ToolResult = { content: string; isError?: boolean }

const updateCoreMemory = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const key = input.key as string
  const content = input.content as string

  if (!key || !content) {
    return { content: "key and content are required", isError: true }
  }

  const [existing] = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core"), eq(agentMemories.key, key)))

  if (existing) {
    await db
      .update(agentMemories)
      .set({ content, updatedAt: new Date() })
      .where(eq(agentMemories.id, existing.id))
    return { content: `Core memory "${key}" updated.` }
  }

  await db.insert(agentMemories).values({ agentId, type: "core", key, content })
  return { content: `Core memory "${key}" saved.` }
}

const deleteCoreMemory = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const key = input.key as string

  if (!key) {
    return { content: "key is required", isError: true }
  }

  const deleted = await db
    .delete(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core"), eq(agentMemories.key, key)))
    .returning()

  if (deleted.length === 0) {
    return { content: `Core memory "${key}" not found.`, isError: true }
  }

  return { content: `Core memory "${key}" deleted.` }
}

const saveToArchive = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const content = input.content as string
  const category = (input.category as string) ?? null

  if (!content) {
    return { content: "content is required", isError: true }
  }

  await db.insert(agentMemories).values({ agentId, type: "archival", content, category })
  return { content: "Saved to archival memory." }
}

const searchArchive = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const query = input.query as string
  const category = input.category as string | undefined
  const limit = (input.limit as number) ?? 10

  if (!query) {
    return { content: "query is required", isError: true }
  }

  const conditions = [
    eq(agentMemories.agentId, agentId),
    eq(agentMemories.type, "archival"),
    ilike(agentMemories.content, `%${query}%`),
  ]

  if (category) {
    conditions.push(eq(agentMemories.category, category))
  }

  const results = await db
    .select()
    .from(agentMemories)
    .where(and(...conditions))
    .limit(limit)

  return {
    content: JSON.stringify(
      results.map((r) => ({ id: r.id, content: r.content, category: r.category, createdAt: r.createdAt }))
    ),
  }
}

export const executeMemoryTool = async (
  agentId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (agentId: string, input: Record<string, unknown>) => Promise<ToolResult>> = {
    updateCoreMemory,
    deleteCoreMemory,
    saveToArchive,
    searchArchive,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown memory tool: ${toolName}`, isError: true }

  return handler(agentId, input)
}
