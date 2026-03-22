'use client';

interface DocumentPickerButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
}

export function DocumentPickerButton({ onClick, disabled = false, isActive = false }: DocumentPickerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative p-2.5 text-foreground-muted hover:text-primary transition-colors disabled:opacity-50"
      title="Discuss a document"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 3v5a2 2 0 002 2h4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6M9 17h4" />
      </svg>
      {isActive && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
      )}
    </button>
  );
}
