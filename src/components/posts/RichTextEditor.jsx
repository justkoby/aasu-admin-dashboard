import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import {
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo,
  Redo,
  Pilcrow
} from 'lucide-react'

export default function RichTextEditor({ value, onChange }) {
  // Ref to track the last externally set or user-typed value to prevent reset during typing
  const lastExternalValueRef = useRef(value || '')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank'
        }
      })
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastExternalValueRef.current = html
      onChange(html)
    }
  })

  // Synchronize editor content when external value changes (e.g. after async database fetch)
  useEffect(() => {
    if (!editor) return
    const incoming = value || ''

    if (incoming !== lastExternalValueRef.current) {
      const currentHtml = editor.getHTML()
      if (incoming !== currentHtml) {
        editor.commands.setContent(incoming, false)
      }
      lastExternalValueRef.current = incoming
    }
  }, [value, editor])

  if (!editor) {
    return (
      <div className="tiptap-editor-container">
        <div className="skeleton" style={{ height: '350px' }}></div>
      </div>
    )
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter URL:', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="tiptap-editor-container">
      {/* Editor Toolbar */}
      <div className="tiptap-toolbar" role="toolbar" aria-label="Text formatting">
        {/* Paragraph */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={`toolbar-btn ${editor.isActive('paragraph') ? 'active' : ''}`}
          title="Paragraph"
        >
          <Pilcrow size={16} />
        </button>

        {/* Heading 2 */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>

        {/* Heading 3 */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </button>

        {/* Bold */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>

        {/* Bullet List */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>

        {/* Blockquote */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
          title="Blockquote"
        >
          <Quote size={16} />
        </button>

        {/* Link */}
        <button
          type="button"
          onClick={setLink}
          className={`toolbar-btn ${editor.isActive('link') ? 'active' : ''}`}
          title="Add/Edit Link"
        >
          <Link2 size={16} />
        </button>

        {/* Divider / spacing */}
        <span style={{ borderLeft: '1px solid var(--posts-border)', margin: '0 4px' }}></span>

        {/* Undo */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className="toolbar-btn"
          title="Undo"
        >
          <Undo size={16} />
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className="toolbar-btn"
          title="Redo"
        >
          <Redo size={16} />
        </button>
      </div>

      {/* Editor Content Area */}
      <EditorContent editor={editor} className="tiptap-editor-content" />
    </div>
  )
}
