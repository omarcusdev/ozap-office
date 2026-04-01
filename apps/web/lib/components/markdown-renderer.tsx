"use client"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/lib/components/ui/table"
import type { Components } from "react-markdown"

const components: Components = {
  table: ({ children }) => <Table>{children}</Table>,
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableHead>{children}</TableHead>,
  td: ({ children }) => <TableCell>{children}</TableCell>,
  pre: ({ children }) => (
    <pre className="bg-canvas border border-edge rounded-sm p-3 overflow-x-auto text-[12px] font-mono my-2">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="bg-raised border border-edge-light rounded px-1.5 py-0.5 text-[12px] font-mono text-gold" {...props}>
          {children}
        </code>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-light underline underline-offset-2">
      {children}
    </a>
  ),
}

type MarkdownRendererProps = {
  content: string
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => (
  <div className="text-[13px] text-cream/90 leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-hr:my-2 prose-strong:text-cream prose-headings:text-cream">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
      {content}
    </Markdown>
  </div>
)
