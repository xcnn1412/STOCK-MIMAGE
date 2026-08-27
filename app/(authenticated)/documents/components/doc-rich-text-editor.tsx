'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ponytail: ไม่ reuse components/rich-text-editor.tsx (ตัวแชทของโมดูล jobs) เพราะมัน
// configure StarterKit ปิด bulletList/orderedList/listItem ไว้ แต่ PDF ของโมดูลเอกสาร
// (lib/pdf-html.tsx) รองรับ <ul>/<ol> และเงื่อนไขในแม่แบบต้องใช้ bullet — เลยทำตัวเล็กแยก
// ponytail: ไม่ sync `value` กลับเข้า editor หลัง mount — ผู้เรียกใช้ `key` remount แทน
// เมื่อเปลี่ยนแบรนด์/ประเภท/เวอร์ชัน (ง่ายกว่าและไม่มี loop ระหว่างพิมพ์)

export interface DocRichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  className?: string
}

export default function DocRichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = '180px',
  className,
}: DocRichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // ปิดทุกอย่างที่ lib/pdf-html.tsx เรนเดอร์ไม่ได้ — ผลลัพธ์เหลือแค่
      // p / strong / em / ul / ol / li / br เท่านั้น (ที่เหลือจะหายไปเงียบๆ ใน PDF)
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
        strike: false,
        code: false,
        link: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rte-content',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  })

  const btn = (active: boolean) =>
    cn('size-7 rounded-sm', active && 'bg-accent text-accent-foreground')

  return (
    <div className={cn('rounded-md border bg-background', className)}>
      <div className="flex items-center gap-0.5 border-b px-1 py-1">
        <Button
          type="button" variant="ghost" size="icon" title="ตัวหนา"
          className={btn(!!editor?.isActive('bold'))}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" title="ตัวเอียง"
          className={btn(!!editor?.isActive('italic'))}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" title="หัวข้อย่อย"
          className={btn(!!editor?.isActive('bulletList'))}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" title="หัวข้อย่อยแบบตัวเลข"
          className={btn(!!editor?.isActive('orderedList'))}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </Button>
      </div>
      {/* ponytail: .rte-content เซ็ต p{margin:0} ไว้แล้ว — เติมสไตล์ list ตรงนี้พอ */}
      <EditorContent
        editor={editor}
        className="[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:my-0.5"
      />
    </div>
  )
}
