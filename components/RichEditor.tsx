'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import { useEffect, useRef } from 'react'
import { Bold, Italic, UnderlineIcon, Heading2, Heading3, List, ListOrdered, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('bucket', 'event-banners')
  const res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'include' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data.url
}

export default function RichEditor({ value, onChange, placeholder }: RichEditorProps) {
  const t = useT()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: placeholder ?? t('richEditor.placeholder'),
      }),
    ],
    content: value || '',
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[220px] prose prose-sm max-w-none px-4 py-3',
      },
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    if (file.size > 5 * 1024 * 1024) { toast.error(t('richEditor.imageTooLarge')); return }
    const toastId = toast.loading(t('richEditor.uploading'))
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url }).run()
      toast.success(t('richEditor.imageInserted'), { id: toastId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('richEditor.unknownError')
      toast.error(t('richEditor.uploadFailed').replace('{msg}', msg), { id: toastId })
    }
    e.target.value = ''
  }

  if (!editor) return null

  const btn = (active: boolean, onClick: () => void, children: React.ReactNode, title?: string) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`p-1.5 rounded hover:bg-[var(--color-surface-2)] transition-colors ${active ? 'bg-[var(--color-surface-2)] text-indigo-600' : 'text-fg-muted'}`}
    >
      {children}
    </button>
  )

  return (
    <div className="border border-input rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 bg-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-token bg-[var(--color-surface)]/50 flex-wrap">
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={14} />, t('richEditor.bold'))}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={14} />, t('richEditor.italic'))}
        {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={14} />, t('richEditor.underline'))}
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={14} />, t('richEditor.h2'))}
        {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={14} />, t('richEditor.h3'))}
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List size={14} />, t('richEditor.bulletList'))}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />, t('richEditor.orderedList'))}
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        {btn(false, () => fileInputRef.current?.click(), <ImageIcon size={14} />, t('richEditor.insertImage'))}
      </div>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImageUpload} />
      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  )
}
