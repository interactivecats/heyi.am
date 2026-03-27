import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  TranscriptMessage,
  TranscriptBlock,
  TranscriptToolCallBlock,
} from '../types'

// ── Tool icons ──────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '✏️',
  Bash: '▶',
  Grep: '🔍',
  Glob: '📂',
  Agent: '🤖',
  WebSearch: '🌐',
  WebFetch: '🌐',
}

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '⚙'
}

// ── Tool call summary ───────────────────────────────────────

function toolSummary(block: TranscriptToolCallBlock): string {
  const { toolName, input } = block
  if (!input) return toolName

  switch (toolName) {
    case 'Read':
      return input
    case 'Write':
      return input
    case 'Edit':
      return input
    case 'Bash':
      return input.length > 80 ? input.slice(0, 77) + '...' : input
    case 'Grep':
    case 'Glob':
      return input
    case 'Agent':
      return input
    default:
      return input.length > 60 ? input.slice(0, 57) + '...' : input
  }
}

// ── Collapsible tool call ───────────────────────────────────

function ToolCallBlock({ block }: { block: TranscriptToolCallBlock }) {
  const [expanded, setExpanded] = useState(false)

  const hasOutput = !!block.output
  const isEdit = block.toolName === 'Edit'
  const isBash = block.toolName === 'Bash'

  return (
    <div className="my-1.5 border border-ghost rounded-md bg-surface-lowest overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-low transition-colors cursor-pointer"
      >
        <span className="text-xs shrink-0 w-4 text-center">{toolIcon(block.toolName)}</span>
        <span className="font-mono text-[11px] font-semibold text-primary shrink-0">
          {block.toolName}
        </span>
        <span className="font-mono text-[11px] text-on-surface-variant truncate flex-1">
          {toolSummary(block)}
        </span>
        {block.isError && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-error shrink-0">
            error
          </span>
        )}
        <span className="text-[10px] text-outline shrink-0 transition-transform" style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ▸
        </span>
      </button>

      {expanded && (
        <div className="border-t border-ghost">
          {/* Input detail for edit tools */}
          {isEdit && block.inputData && (
            <div className="px-3 py-2 border-b border-ghost">
              {typeof block.inputData.old_string === 'string' && (
                <div className="mb-2">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1">old</div>
                  <pre className="font-mono text-[11px] text-error/80 bg-error/5 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {block.inputData.old_string as string}
                  </pre>
                </div>
              )}
              {typeof block.inputData.new_string === 'string' && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1">new</div>
                  <pre className="font-mono text-[11px] text-green/80 bg-green/5 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {block.inputData.new_string as string}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Bash command highlight */}
          {isBash && block.input && (
            <div className="px-3 py-2 border-b border-ghost bg-[var(--inverse-surface)]">
              <pre className="font-mono text-[11px] text-[var(--inverse-on-surface)] whitespace-pre-wrap break-all">
                $ {block.input}
              </pre>
            </div>
          )}

          {/* Output */}
          {hasOutput && (
            <div className="px-3 py-2 max-h-64 overflow-y-auto">
              <pre className={`font-mono text-[11px] whitespace-pre-wrap break-all ${
                block.isError ? 'text-error' : 'text-on-surface-variant'
              }`}>
                {block.output}
              </pre>
              {block.outputTruncated && (
                <div className="font-mono text-[9px] uppercase tracking-wider text-outline mt-2">
                  output truncated
                </div>
              )}
            </div>
          )}

          {!hasOutput && !isEdit && !isBash && (
            <div className="px-3 py-2 text-[11px] text-outline italic">no output</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Thinking block ──────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 80).replace(/\n/g, ' ')

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left cursor-pointer group"
      >
        <span className="text-[10px] text-outline transition-transform shrink-0" style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ▸
        </span>
        <span className="font-mono text-[11px] text-outline italic group-hover:text-on-surface-variant transition-colors">
          {expanded ? 'thinking' : `thinking: ${preview}${text.length > 80 ? '...' : ''}`}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1.5 pl-3 border-l-2 border-ghost">
          <pre className="font-mono text-[11px] text-on-surface-variant/70 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Text block with markdown-lite rendering ─────────────────

/** Max characters before a text block collapses with "Show more" */
const TEXT_COLLAPSE_THRESHOLD = 300

function TextContent({ text, highlights }: { text: string; highlights?: string }) {
  const [expanded, setExpanded] = useState(text.length <= TEXT_COLLAPSE_THRESHOLD)
  const isLong = text.length > TEXT_COLLAPSE_THRESHOLD

  // Find a good truncation point (end of sentence or word near threshold)
  const truncateAt = (() => {
    if (!isLong) return text.length
    // Try to cut at a sentence boundary
    const slice = text.slice(0, TEXT_COLLAPSE_THRESHOLD + 50)
    const sentenceEnd = slice.lastIndexOf('. ', TEXT_COLLAPSE_THRESHOLD)
    if (sentenceEnd > TEXT_COLLAPSE_THRESHOLD * 0.6) return sentenceEnd + 1
    // Fall back to word boundary
    const wordEnd = slice.lastIndexOf(' ', TEXT_COLLAPSE_THRESHOLD)
    return wordEnd > TEXT_COLLAPSE_THRESHOLD * 0.6 ? wordEnd : TEXT_COLLAPSE_THRESHOLD
  })()

  const displayText = expanded ? text : text.slice(0, truncateAt)

  if (highlights) {
    const regex = new RegExp(`(${escapeRegex(highlights)})`, 'gi')
    const parts = displayText.split(regex)

    return (
      <div className="text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words">
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-amber/30 text-on-surface rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
        {isLong && <CollapsToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} />}
      </div>
    )
  }

  return (
    <div>
      <RenderedText text={displayText} />
      {isLong && <CollapsToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} />}
    </div>
  )
}

function CollapsToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-block mt-1 font-mono text-[11px] text-primary hover:underline cursor-pointer"
    >
      {expanded ? '▴ Show less' : '▾ Show more'}
    </button>
  )
}

function RenderedText({ text }: { text: string }) {
  // Split by code fences and render code blocks
  const segments = text.split(/(```[\s\S]*?```)/g)

  return (
    <div className="text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words">
      {segments.map((seg, i) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3)
          const newlineIdx = inner.indexOf('\n')
          const lang = newlineIdx > 0 ? inner.slice(0, newlineIdx).trim() : ''
          const code = newlineIdx > 0 ? inner.slice(newlineIdx + 1) : inner

          return (
            <pre
              key={i}
              className="my-2 bg-surface-lowest border border-ghost rounded-md px-3 py-2 font-mono text-[11px] overflow-x-auto"
            >
              {lang && (
                <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">
                  {lang}
                </div>
              )}
              {code}
            </pre>
          )
        }

        // Inline code
        const inlineParts = seg.split(/(`[^`]+`)/g)
        return (
          <span key={i}>
            {inlineParts.map((part, j) =>
              part.startsWith('`') && part.endsWith('`') ? (
                <code key={j} className="bg-surface-low rounded px-1 py-0.5 font-mono text-[11px]">
                  {part.slice(1, -1)}
                </code>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Message component ───────────────────────────────────────

function MessageBubble({
  message,
  searchQuery,
  messageIndex,
  showRoleBadge = true,
}: {
  message: TranscriptMessage
  searchQuery?: string
  messageIndex: number
  showRoleBadge?: boolean
}) {
  const isUser = message.role === 'user'

  // Count tool calls to show a compact summary when there are many
  const toolCalls = message.blocks.filter(b => b.type === 'tool_call')
  const textBlocks = message.blocks.filter(b => b.type === 'text')
  const thinkingBlocks = message.blocks.filter(b => b.type === 'thinking')
  const [toolsExpanded, setToolsExpanded] = useState(toolCalls.length <= 3)

  return (
    <div
      className="relative"
      data-message-index={messageIndex}
    >
      {/* Role badge — only on first message in a same-role sequence */}
      {showRoleBadge && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-flex items-center font-mono text-[11px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm ${
            isUser
              ? 'bg-primary/10 text-primary'
              : 'bg-green/10 text-green'
          }`}>
            {isUser ? 'you' : 'assistant'}
          </span>
        </div>
      )}

      {/* Content */}
      <div className={`${isUser
        ? 'bg-primary/5 border-l-[3px] border-primary pl-3 py-2 rounded-r-md'
        : 'pl-0.5'
      }`}>
        {/* Thinking blocks first */}
        {thinkingBlocks.map((block, i) => (
          <BlockRenderer key={`t-${i}`} block={block} searchQuery={searchQuery} />
        ))}

        {/* Text blocks */}
        {textBlocks.map((block, i) => (
          <BlockRenderer key={`x-${i}`} block={block} searchQuery={searchQuery} />
        ))}

        {/* Tool calls — collapsed summary when there are many */}
        {toolCalls.length > 3 && !toolsExpanded ? (
          <button
            type="button"
            onClick={() => setToolsExpanded(true)}
            className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors"
          >
            <span className="text-[10px] text-outline">▸</span>
            <span>{toolCalls.length} tool calls</span>
            <span className="text-outline">
              ({[...new Set(toolCalls.map(t => t.type === 'tool_call' ? (t as TranscriptToolCallBlock).toolName : ''))].join(', ')})
            </span>
          </button>
        ) : (
          toolCalls.map((block, i) => (
            <BlockRenderer key={`tc-${i}`} block={block} searchQuery={searchQuery} />
          ))
        )}

        {/* Collapse tool calls button */}
        {toolCalls.length > 3 && toolsExpanded && (
          <button
            type="button"
            onClick={() => setToolsExpanded(false)}
            className="mt-1 font-mono text-[10px] text-outline hover:text-on-surface-variant cursor-pointer"
          >
            ▾ Collapse {toolCalls.length} tool calls
          </button>
        )}
      </div>
    </div>
  )
}

function BlockRenderer({
  block,
  searchQuery,
}: {
  block: TranscriptBlock
  searchQuery?: string
}) {
  switch (block.type) {
    case 'text':
      return <TextContent text={block.text} highlights={searchQuery} />
    case 'thinking':
      return <ThinkingBlock text={block.text} />
    case 'tool_call':
      return <ToolCallBlock block={block} />
  }
}

// ── Search bar ──────────────────────────────────────────────

function TranscriptSearch({
  query,
  onQueryChange,
  matchCount,
  currentMatch,
  onNext,
  onPrev,
  onClose,
}: {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  currentMatch: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center gap-2 bg-surface-lowest border border-ghost rounded-md px-3 py-1.5 shadow-sm">
      <svg className="w-3.5 h-3.5 text-outline shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey ? onPrev() : onNext()
          }
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Search in session..."
        className="bg-transparent text-sm text-on-surface outline-none flex-1 min-w-0"
      />
      {query && (
        <>
          <span className="font-mono text-[10px] text-outline shrink-0">
            {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : 'no matches'}
          </span>
          <button
            type="button"
            onClick={onPrev}
            disabled={matchCount === 0}
            className="text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-30 cursor-pointer"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={matchCount === 0}
            className="text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-30 cursor-pointer"
          >
            ↓
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-outline hover:text-on-surface cursor-pointer ml-1"
      >
        ✕
      </button>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return timestamp
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Main component ──────────────────────────────────────────

interface SessionTranscriptProps {
  messages: TranscriptMessage[]
  initialSearchQuery?: string
  /** When true, renders without search bar or floating button (used inside phase sections) */
  compact?: boolean
}

export function SessionTranscript({ messages, initialSearchQuery, compact }: SessionTranscriptProps) {
  const [searchOpen, setSearchOpen] = useState(!!initialSearchQuery)
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery ?? '')
  const [currentMatch, setCurrentMatch] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut to open search (only in full mode)
  useEffect(() => {
    if (compact) return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [compact])

  // Count matches
  const matchCount = useMemo(() => {
    if (!searchQuery) return 0
    const regex = new RegExp(escapeRegex(searchQuery), 'gi')
    let count = 0
    for (const msg of messages) {
      for (const block of msg.blocks) {
        if (block.type === 'text') {
          const m = block.text.match(regex)
          if (m) count += m.length
        }
      }
    }
    return count
  }, [messages, searchQuery])

  const handleNext = useCallback(() => {
    setCurrentMatch((prev) => (prev + 1) % Math.max(1, matchCount))
  }, [matchCount])

  const handlePrev = useCallback(() => {
    setCurrentMatch((prev) => (prev - 1 + Math.max(1, matchCount)) % Math.max(1, matchCount))
  }, [matchCount])

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setCurrentMatch(0)
  }, [])

  if (messages.length === 0) {
    return (
      <div className={`text-center ${compact ? 'py-4' : 'py-12'}`}>
        <p className="text-sm text-on-surface-variant">No conversation data available.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Search bar */}
      {!compact && searchOpen && (
        <div className="sticky top-12 z-40 mb-4">
          <TranscriptSearch
            query={searchQuery}
            onQueryChange={(q) => {
              setSearchQuery(q)
              setCurrentMatch(0)
            }}
            matchCount={matchCount}
            currentMatch={currentMatch}
            onNext={handleNext}
            onPrev={handlePrev}
            onClose={handleCloseSearch}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => {
          const prevRole = i > 0 ? messages[i - 1].role : null
          const isFirstInGroup = prevRole !== msg.role
          const showTurnDivider = prevRole !== null && prevRole !== msg.role && msg.role === 'user'
          return (
            <div key={msg.id}>
              {showTurnDivider && (
                <div className="border-t border-ghost/60 mb-4 mt-1" />
              )}
              <MessageBubble
                message={msg}
                messageIndex={i}
                searchQuery={searchQuery || undefined}
                showRoleBadge={isFirstInGroup}
              />
            </div>
          )
        })}
      </div>

      {/* Floating search trigger */}
      {!compact && !searchOpen && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-surface-lowest border border-ghost rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
          title="Search in session (Cmd+F)"
        >
          <svg className="w-4 h-4 text-on-surface-variant group-hover:text-on-surface transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      )}
    </div>
  )
}
