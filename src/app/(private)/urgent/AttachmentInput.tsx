'use client';

import { Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const ACCEPT = 'image/*,.pdf,.doc,.docx,.txt';

function clipboardFile(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []);
  return files.find((file) => file.size > 0) || null;
}

export function AttachmentInput({ className }: { className: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardFile(event);
      if (!file || !inputRef.current) return;

      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
      setSelected(file.name || 'Изображение из буфера');
      event.preventDefault();
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return <label className={className}>
    <Paperclip size={20}/>
    <span>
      <strong>Прикрепить фото или файл</strong>
      <small>Выберите файл или просто вставьте картинку через Ctrl+V · до 15 МБ</small>
      {selected && <small aria-live="polite">✓ Прикреплено: {selected}</small>}
    </span>
    <input
      ref={inputRef}
      name="attachment"
      type="file"
      accept={ACCEPT}
      onChange={(event) => setSelected(event.currentTarget.files?.[0]?.name || '')}
    />
  </label>;
}
