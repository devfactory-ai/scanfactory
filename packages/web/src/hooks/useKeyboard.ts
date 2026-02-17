import { useEffect, useCallback } from 'react';

interface KeyboardNavigationOptions {
  /** Navigate to previous item */
  onPrevious?: () => void;
  /** Navigate to next item */
  onNext?: () => void;
  /** Validate current item (Enter or Tab) */
  onValidate?: () => void;
  /** Reject current item (Escape or Backspace) */
  onReject?: () => void;
  /** Toggle zoom on scan viewer */
  onZoomToggle?: () => void;
  /** Go back to list */
  onBack?: () => void;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
}

/**
 * Hook for keyboard navigation in validation views
 *
 * Keyboard shortcuts:
 * - Left Arrow: Previous document
 * - Right Arrow: Next document
 * - Enter / Tab: Validate document
 * - Escape / Backspace: Reject document
 * - Space: Toggle zoom
 * - B / Left Alt: Go back
 */
export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    onPrevious,
    onNext,
    onValidate,
    onReject,
    onZoomToggle,
    onBack,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Tab to work normally in inputs, but not Enter (submit)
        if (event.key !== 'Tab') {
          return;
        }
      }

      // Prevent default for navigation keys
      const navigationKeys = [
        'ArrowLeft',
        'ArrowRight',
        'Enter',
        'Tab',
        'Escape',
        'Backspace',
        ' ',
      ];

      if (navigationKeys.includes(event.key)) {
        // Don't prevent Tab in inputs (for form navigation)
        if (
          event.key === 'Tab' &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        ) {
          return;
        }

        event.preventDefault();
      }

      switch (event.key) {
        case 'ArrowLeft':
          onPrevious?.();
          break;

        case 'ArrowRight':
          onNext?.();
          break;

        case 'Enter':
          // Shift+Enter to validate (avoid conflict with form submit)
          if (event.shiftKey) {
            onValidate?.();
          } else if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            onValidate?.();
          }
          break;

        case 'Tab':
          // Tab to validate when not in form
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            onValidate?.();
          }
          break;

        case 'Escape':
          onReject?.();
          break;

        case 'Backspace':
          // Ctrl+Backspace to reject
          if (event.ctrlKey || event.metaKey) {
            onReject?.();
          }
          break;

        case ' ':
          // Space to toggle zoom
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            onZoomToggle?.();
          }
          break;

        case 'b':
        case 'B':
          // Ctrl+B or just B (when not typing) to go back
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onBack?.();
          } else if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            onBack?.();
          }
          break;

        case 'Alt':
          // Alt key alone to go back (on keyup)
          break;

        default:
          break;
      }
    },
    [onPrevious, onNext, onValidate, onReject, onZoomToggle, onBack]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * Hook for batch selection with keyboard
 */
interface BatchSelectionOptions {
  /** Total number of items */
  total: number;
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when selection changes */
  onSelectionChange: (index: number) => void;
  /** Toggle selection of current item */
  onToggleSelect?: () => void;
  /** Select all items */
  onSelectAll?: () => void;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
}

export function useBatchKeyboardNavigation(options: BatchSelectionOptions) {
  const {
    total,
    selectedIndex,
    onSelectionChange,
    onToggleSelect,
    onSelectAll,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          if (selectedIndex > 0) {
            onSelectionChange(selectedIndex - 1);
          }
          break;

        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          if (selectedIndex < total - 1) {
            onSelectionChange(selectedIndex + 1);
          }
          break;

        case 'Home':
          event.preventDefault();
          onSelectionChange(0);
          break;

        case 'End':
          event.preventDefault();
          onSelectionChange(total - 1);
          break;

        case ' ':
          event.preventDefault();
          onToggleSelect?.();
          break;

        case 'a':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onSelectAll?.();
          }
          break;

        default:
          break;
      }
    },
    [total, selectedIndex, onSelectionChange, onToggleSelect, onSelectAll]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * Visual keyboard shortcut hints component helper
 */
export const KEYBOARD_SHORTCUTS = {
  navigation: [
    { key: '←', description: 'Document précédent' },
    { key: '→', description: 'Document suivant' },
  ],
  actions: [
    { key: 'Enter', description: 'Valider' },
    { key: 'Esc', description: 'Rejeter' },
  ],
  view: [
    { key: 'Space', description: 'Zoom' },
    { key: 'B', description: 'Retour liste' },
  ],
  batch: [
    { key: '↑/↓', description: 'Navigation' },
    { key: 'Space', description: 'Sélectionner' },
    { key: 'Ctrl+A', description: 'Tout sélectionner' },
  ],
} as const;
