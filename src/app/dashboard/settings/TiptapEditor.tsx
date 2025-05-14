'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
// Placeholder for potential styling if needed directly here, or use global styles
// import './TiptapEditor.css'; 

interface TiptapEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  editable?: boolean;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({ content, onChange, editable = true }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure StarterKit options here if needed
        // For example, to disable some default extensions:
        // heading: { levels: [1, 2, 3] },
        // history: true, // Enabled by default
        // gapcursor: false, // If you don't need it
      }),
      Link.configure({
        openOnClick: false, // Open link dialog on click, or handle it manually
        autolink: true,
      }),
      Image.configure({
        // inline: true, // Allow images to be inline
        // allowBase64: true, // If you need to support base64 images
      }),
      // Add other extensions here as needed (e.g., TextAlign, Color, Highlight, etc.)
    ],
    content: content,
    editable: editable,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  // Ensure editor content is updated if the external 'content' prop changes
  // This is important if the content can be reset or changed by an external action (e.g., "Use Default Template")
  React.useEffect(() => {
    if (editor && editor.isEditable && editor.getHTML() !== content) {
      editor.commands.setContent(content, false); // false to not emit update
    }
  }, [content, editor]);

  if (!editor) {
    return <div className="min-h-[250px] p-4 border rounded-md bg-gray-50 flex items-center justify-center">Initializing editor...</div>;
  }

  return (
    <div className="tiptap-editor-wrapper border border-input rounded-md shadow-sm">
      {/* Basic Toolbar (can be expanded significantly) */}
      {editable && (
        <div className="toolbar p-1 border-b border-input flex flex-wrap gap-1">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`p-1 rounded hover:bg-muted ${editor.isActive('bold') ? 'is-active bg-muted' : ''}`}
            type="button"
            title="Bold"
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`p-1 rounded hover:bg-muted ${editor.isActive('italic') ? 'is-active bg-muted' : ''}`}
            type="button"
            title="Italic"
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            className={`p-1 rounded hover:bg-muted ${editor.isActive('strike') ? 'is-active bg-muted' : ''}`}
            type="button"
            title="Strikethrough"
          >
            S̶
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1 rounded hover:bg-muted ${editor.isActive('bulletList') ? 'is-active bg-muted' : ''}`}
            type="button"
            title="Bullet List"
          >
            UL
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1 rounded hover:bg-muted ${editor.isActive('orderedList') ? 'is-active bg-muted' : ''}`}
            type="button"
            title="Ordered List"
          >
            OL
          </button>
          {/* Add more buttons for Link, Image, Headings, etc. */}
        </div>
      )}
      <EditorContent editor={editor} className="p-2 min-h-[200px] prose max-w-none prose-sm focus:outline-none" />
    </div>
  );
};

export default TiptapEditor; 