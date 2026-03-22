'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback, ChangeEvent } from 'react';
import { STTButton } from '../chat/STTButton';
import { LoadingWordRotator } from '../chat/LoadingWordRotator';
import { DocumentPickerButton } from './DocumentPickerButton';

export interface ImageAttachment {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  preview: string;
  name: string;
}

interface InputCardProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  onDocumentClick?: () => void;
}

export function InputCard({
  onSend,
  isLoading = false,
  placeholder = 'Ask me anything...',
  onDocumentClick,
}: InputCardProps) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const justSubmittedRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.4;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Refocus after submission
  useEffect(() => {
    if (justSubmittedRef.current && input === '') {
      const focusInput = () => textareaRef.current?.focus();
      focusInput();
      queueMicrotask(focusInput);
      requestAnimationFrame(focusInput);
      setTimeout(focusInput, 100);
      setTimeout(focusInput, 250);
      setTimeout(() => { justSubmittedRef.current = false; }, 500);
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    const hasContent = trimmed || attachedImages.length > 0;
    if (hasContent && !isLoading) {
      justSubmittedRef.current = true;
      onSend(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
      setInput('');
      setAttachedImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleBlur = useCallback(() => {
    if (justSubmittedRef.current) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, []);

  const handleSpeechTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    textareaRef.current?.focus();
  }, []);

  const handleImageSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) return;

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const dataOnly = base64.split(',')[1];
        setAttachedImages((prev) => [
          ...prev,
          {
            data: dataOnly,
            mediaType: file.type as ImageAttachment['mediaType'],
            preview: base64,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const canSend = (input.trim().length > 0 || attachedImages.length > 0) && !isLoading;

  return (
    <div className="sticky top-0 z-30 bg-[var(--input-bg)] border-b border-[var(--card-border)] p-4">
      <div className="max-w-3xl mx-auto">
        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachedImages.map((img, index) => (
              <div key={index} className="relative group">
                <img
                  src={img.preview}
                  alt={img.name}
                  className="w-14 h-14 object-cover border border-[var(--card-border)]"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => !isLoading && setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={attachedImages.length > 0 ? 'Add a message about this image...' : placeholder}
          aria-disabled={isLoading}
          rows={1}
          className={`
            w-full px-4 py-3 resize-none
            bg-transparent
            text-foreground placeholder-foreground-muted
            focus:outline-none
            transition-colors
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          style={{ maxHeight: '40vh' }}
        />

        {/* Bottom row: left buttons + right send */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {/* Image upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-2.5 text-foreground-muted hover:text-primary transition-colors disabled:opacity-50"
              title="Attach image"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Speech-to-text */}
            <STTButton
              onTranscript={handleSpeechTranscript}
              disabled={isLoading}
            />

            {/* Document discussion */}
            {onDocumentClick && (
              <DocumentPickerButton
                onClick={onDocumentClick}
                disabled={isLoading}
              />
            )}
          </div>

          {/* Animated word rotator (replaces spinner) */}
          {isLoading && (
            <div className="flex-1 flex justify-center">
              <LoadingWordRotator />
            </div>
          )}

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={`
              p-3 transition-all duration-200
              ${canSend
                ? 'bg-primary text-[var(--background)] hover:bg-primary-hover'
                : 'text-foreground-muted'
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {isLoading ? (
              <span className="w-5 h-5 flex items-center justify-center">
                <span className="w-3 h-3 rounded-sm bg-current animate-pulse" />
              </span>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
