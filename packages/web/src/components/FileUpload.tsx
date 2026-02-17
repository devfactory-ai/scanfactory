import { useState, useRef, useCallback, memo, type DragEvent, type ChangeEvent, type KeyboardEvent } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
}

export const FileUpload = memo(function FileUpload({
  onFileSelect,
  accept = 'image/*,.pdf',
  disabled = false,
  id,
  'aria-describedby': ariaDescribedBy,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }

      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [disabled, handleFile]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleClear = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setPreview(null);
    setFileName(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  // Keyboard handler for the drop zone
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;
      // Enter or Space activates the file input
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [disabled]
  );

  // Handle clear button keyboard
  const handleClearKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClear(e);
      }
    },
    [handleClear]
  );

  return (
    <div
      id={id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={fileName ? `Fichier sélectionné: ${fileName}` : 'Zone de dépôt de fichier'}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="sr-only"
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={`Aperçu du fichier: ${fileName}`}
            className="max-h-64 mx-auto rounded-lg shadow-sm"
          />
          <button
            type="button"
            onClick={handleClear}
            onKeyDown={handleClearKeyDown}
            aria-label="Supprimer le fichier sélectionné"
            className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="mt-4 text-sm text-gray-600" aria-live="polite">{fileName}</p>
        </div>
      ) : (
        <div>
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-600">
            <span className="font-medium text-primary-600">Cliquez pour uploader</span>
            {' '}ou glissez-d&eacute;posez
          </p>
          <p className="mt-1 text-xs text-gray-500" id="file-upload-hint">
            PNG, JPG, PDF jusqu&apos;&agrave; 10MB
          </p>
        </div>
      )}
    </div>
  );
});
