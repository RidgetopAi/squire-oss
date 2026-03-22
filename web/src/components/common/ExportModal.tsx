'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'txt';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  title?: string;
  formats?: ExportFormat[];
  defaultFormat?: ExportFormat;
}

const formatDescriptions: Record<ExportFormat, string> = {
  json: 'Structured data format, ideal for backups',
  markdown: 'Human-readable format, great for documentation',
  csv: 'Spreadsheet format, import into Excel/Sheets',
  txt: 'Plain text format, simple and universal',
};

const formatIcons: Record<ExportFormat, string> = {
  json: '{ }',
  markdown: 'MD',
  csv: '📊',
  txt: '📄',
};

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  title = 'Export',
  formats = ['json', 'markdown', 'csv'],
  defaultFormat = 'markdown',
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(defaultFormat);
  const [isExporting, setIsExporting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setSuccess(false);
    try {
      await onExport(selectedFormat);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1000);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50"
          >
            <div className="glass rounded-xl border border-glass-border shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-glass-border">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <p className="text-sm text-foreground-muted">Select export format:</p>

                <div className="space-y-2">
                  {formats.map((format) => (
                    <button
                      key={format}
                      onClick={() => setSelectedFormat(format)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left
                        ${
                          selectedFormat === format
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-glass-border bg-background-secondary hover:border-foreground-muted text-foreground-muted'
                        }
                      `}
                    >
                      <span className="w-8 h-8 flex items-center justify-center bg-background-tertiary rounded-lg text-xs font-mono">
                        {formatIcons[format]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm uppercase">{format}</div>
                        <div className="text-xs text-foreground-muted truncate">
                          {formatDescriptions[format]}
                        </div>
                      </div>
                      {selectedFormat === format && (
                        <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-5 py-4 border-t border-glass-border bg-background-secondary/50">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-glass-border hover:bg-background-tertiary transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className={`
                    flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2
                    ${
                      success
                        ? 'bg-green-500 text-white'
                        : 'bg-primary text-white hover:bg-primary-hover'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isExporting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Exporting...
                    </>
                  ) : success ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Done!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
