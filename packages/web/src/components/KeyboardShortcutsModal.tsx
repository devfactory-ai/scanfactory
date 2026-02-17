import { memo } from 'react';
import { KEYBOARD_SHORTCUTS } from '../hooks/useKeyboard';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal displaying available keyboard shortcuts
 */
export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="shortcuts-title" className="text-lg font-medium text-gray-900">
            Raccourcis clavier
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
            aria-label="Fermer la fenêtre des raccourcis"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <ShortcutGroup title="Navigation" shortcuts={KEYBOARD_SHORTCUTS.navigation} />
          <ShortcutGroup title="Actions" shortcuts={KEYBOARD_SHORTCUTS.actions} />
          <ShortcutGroup title="Vue" shortcuts={KEYBOARD_SHORTCUTS.view} />
        </div>
      </div>
    </div>
  );
});

interface ShortcutGroupProps {
  title: string;
  shortcuts: ReadonlyArray<{ readonly key: string; readonly description: string }>;
}

const ShortcutGroup = memo(function ShortcutGroup({ title, shortcuts }: ShortcutGroupProps) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>
      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.key} className="flex items-center justify-between text-sm">
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
              {shortcut.key}
            </kbd>
            <span className="text-gray-600">{shortcut.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
