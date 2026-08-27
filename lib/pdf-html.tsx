import React from 'react'
import { Text, View } from '@react-pdf/renderer'

// ============================================================================
// HTML (TipTap) → react-pdf nodes
// ponytail: 7-tag subset (p, br, strong/b, em/i, u, ul/ol/li, h1-h3), extend when
// templates need more. No parser dependency — regex tokenizer is plenty here.
// ============================================================================

export interface PdfHtmlStyles {
  /** base paragraph style */
  text?: Record<string, unknown>
  /** heading style (merged on top of `text`) */
  heading?: Record<string, unknown>
  /** left padding for list items */
  listIndent?: number
}

type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
type Block = { tag: 'p' | 'h1' | 'h2' | 'h3' | 'li'; marker?: string; runs: Run[] }

const ENTITIES: [RegExp, string][] = [
  [/&nbsp;/g, ' '],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#0?39;/g, "'"],
  [/&apos;/g, "'"],
  [/&amp;/g, '&'], // last — otherwise &amp;lt; double-decodes
]

function decode(s: string): string {
  let out = s
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep)
  return out
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Convert a small HTML subset into react-pdf nodes. Never throws. */
export function htmlToPdfNodes(html: string, styles?: PdfHtmlStyles): React.ReactNode {
  if (!html) return null
  try {
    return render(parse(html), styles)
  } catch {
    // malformed markup — degrade to plain text rather than blowing up the PDF
    const plain = stripTags(html)
    return plain ? <Text style={styles?.text as never}>{plain}</Text> : null
  }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function parse(html: string): Block[] {
  const blocks: Block[] = []
  const lists: { ordered: boolean; count: number }[] = []
  let bold = 0
  let italic = 0
  let underline = 0
  let current: Block | null = null

  const open = (tag: Block['tag'], marker?: string) => {
    flush()
    current = { tag, marker, runs: [] }
  }
  const flush = () => {
    if (current && current.runs.some((r) => r.text.trim())) blocks.push(current)
    current = null
  }
  /** onlyIfOpen: ข้อความที่เป็นช่องว่างล้วน ต่อท้ายได้เฉพาะเมื่อมีบล็อกเปิดอยู่แล้ว */
  const push = (text: string, onlyIfOpen = false) => {
    if (!text) return
    if (!current) {
      if (onlyIfOpen) return
      current = { tag: 'p', runs: [] }
    }
    current.runs.push({
      text,
      bold: bold > 0 || undefined,
      italic: italic > 0 || undefined,
      underline: underline > 0 || undefined,
    })
  }

  const TOKEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>|[^<]+/g
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(html)) !== null) {
    const raw = m[0]
    const tag = m[1]?.toLowerCase()

    if (!tag) {
      // text node — collapse whitespace, keep a single separating space
      const txt = decode(raw).replace(/\s+/g, ' ')
      push(txt, !txt.trim())
      continue
    }

    const closing = raw.startsWith('</')
    switch (tag) {
      case 'br':
        push('\n')
        break
      case 'p':
      case 'div':
      case 'h1':
      case 'h2':
      case 'h3':
        if (closing) flush()
        else open(tag === 'div' ? 'p' : (tag as Block['tag']))
        break
      case 'ul':
      case 'ol':
        flush()
        if (closing) lists.pop()
        else lists.push({ ordered: tag === 'ol', count: 0 })
        break
      case 'li': {
        if (closing) { flush(); break }
        const list = lists[lists.length - 1]
        const marker = list?.ordered ? `${++list.count}.` : '•'
        open('li', marker)
        break
      }
      case 'strong':
      case 'b':
        bold += closing ? -1 : 1
        break
      case 'em':
      case 'i':
        italic += closing ? -1 : 1
        break
      case 'u':
        underline += closing ? -1 : 1
        break
      default:
        // unknown tag: ignored, its text content still flows into the block
        break
    }
    if (bold < 0) bold = 0
    if (italic < 0) italic = 0
    if (underline < 0) underline = 0
  }
  flush()
  return blocks
}

// ── Rendering ───────────────────────────────────────────────────────────────

const HEADING_SIZE: Record<string, number> = { h1: 20, h2: 17, h3: 15 }

function runStyle(r: Run) {
  return {
    fontWeight: r.bold ? ('bold' as const) : undefined,
    fontStyle: r.italic ? ('italic' as const) : undefined,
    textDecoration: r.underline ? ('underline' as const) : undefined,
  }
}

function render(blocks: Block[], styles?: PdfHtmlStyles): React.ReactNode {
  const base = (styles?.text ?? {}) as Record<string, unknown>
  const indent = styles?.listIndent ?? 12

  return blocks.map((b, i) => {
    const inner = b.runs.map((r, j) => (
      <Text key={j} style={runStyle(r) as never}>{r.text}</Text>
    ))

    if (b.tag === 'li') {
      return (
        <View key={i} style={{ flexDirection: 'row', paddingLeft: indent, marginBottom: 2 }}>
          <Text style={{ ...base, width: 16 } as never}>{b.marker}</Text>
          <Text style={{ ...base, flex: 1 } as never}>{inner}</Text>
        </View>
      )
    }

    if (b.tag !== 'p') {
      const heading = {
        ...base,
        fontWeight: 'bold',
        fontSize: HEADING_SIZE[b.tag],
        marginTop: 4,
        marginBottom: 2,
        ...(styles?.heading ?? {}),
      }
      return <Text key={i} style={heading as never}>{inner}</Text>
    }

    return <Text key={i} style={{ ...base, marginBottom: 3 } as never}>{inner}</Text>
  })
}
