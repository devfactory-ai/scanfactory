/**
 * Accessibility Tests for Web Components
 *
 * Tests ARIA attributes, keyboard navigation, and screen reader support
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// Components
import { FileUpload } from '../FileUpload';
import { LoadingSpinner, PageLoadingSpinner } from '../LoadingSpinner';
import { ConfidenceBadge } from '../ConfidenceBadge';
import { StatusBadge } from '../StatusBadge';
import { AnomaliesAlert } from '../AnomaliesAlert';
import { DocumentNavigator } from '../DocumentNavigator';
import { ErrorAlert, FieldError, ErrorToast } from '../ErrorAlert';

// ============================================================================
// FileUpload Accessibility Tests
// ============================================================================

describe('FileUpload Accessibility', () => {
  const mockOnFileSelect = vi.fn();

  it('should have role="button" for screen readers', () => {
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    expect(dropzone).toBeInTheDocument();
  });

  it('should be focusable with keyboard', () => {
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveAttribute('tabIndex', '0');
  });

  it('should not be focusable when disabled', () => {
    render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveAttribute('tabIndex', '-1');
    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
  });

  it('should have descriptive aria-label', () => {
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveAttribute('aria-label', 'Zone de dépôt de fichier');
  });

  it('should update aria-label when file is selected', async () => {
    const user = userEvent.setup();
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    await user.upload(input, file);

    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveAttribute('aria-label', 'Fichier sélectionné: test.pdf');
  });

  it('should respond to Enter key', async () => {
    const user = userEvent.setup();
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    dropzone.focus();

    // The component triggers click on the hidden input
    const clickSpy = vi.fn();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.click = clickSpy;

    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should respond to Space key', async () => {
    const user = userEvent.setup();
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    dropzone.focus();

    const clickSpy = vi.fn();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.click = clickSpy;

    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should have visible focus indicator', () => {
    render(<FileUpload onFileSelect={mockOnFileSelect} />);

    const dropzone = screen.getByRole('button');
    expect(dropzone.className).toContain('focus:ring-2');
    expect(dropzone.className).toContain('focus:outline-none');
  });
});

// ============================================================================
// LoadingSpinner Accessibility Tests
// ============================================================================

describe('LoadingSpinner Accessibility', () => {
  it('should have role="status" for screen readers', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
  });

  it('should have aria-live="polite" for status updates', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });

  it('should have aria-busy="true" while loading', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-busy', 'true');
  });

  it('should have screen reader text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Chargement en cours...')).toBeInTheDocument();
  });

  it('should hide decorative spinner from screen readers', () => {
    render(<LoadingSpinner />);

    const spinnerVisual = document.querySelector('[aria-hidden="true"]');
    expect(spinnerVisual).toBeInTheDocument();
  });
});

describe('PageLoadingSpinner Accessibility', () => {
  it('should have role="status"', () => {
    render(<PageLoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
  });

  it('should have visible loading text', () => {
    render(<PageLoadingSpinner />);

    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });
});

// ============================================================================
// ConfidenceBadge Accessibility Tests
// ============================================================================

describe('ConfidenceBadge Accessibility', () => {
  it('should have role="status"', () => {
    render(<ConfidenceBadge confidence={0.85} />);

    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
  });

  it('should have descriptive aria-label with confidence level', () => {
    render(<ConfidenceBadge confidence={0.95} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Confiance élevée: 95%');
  });

  it('should indicate medium confidence', () => {
    render(<ConfidenceBadge confidence={0.75} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Confiance moyenne: 75%');
  });

  it('should indicate low confidence', () => {
    render(<ConfidenceBadge confidence={0.5} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Confiance faible: 50%');
  });

  it('should handle null confidence', () => {
    render(<ConfidenceBadge confidence={null} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Confiance non disponible');
  });

  it('should hide decorative dot from screen readers', () => {
    render(<ConfidenceBadge confidence={0.85} showPercentage={false} />);

    const dot = document.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });
});

// ============================================================================
// StatusBadge Accessibility Tests
// ============================================================================

describe('StatusBadge Accessibility', () => {
  it('should have role="status"', () => {
    render(<StatusBadge status="pending" />);

    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
  });

  it('should have descriptive aria-label', () => {
    render(<StatusBadge status="validated" />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Statut: Validé');
  });

  it('should handle different statuses', () => {
    const { rerender } = render(<StatusBadge status="pending" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Statut: En attente');

    rerender(<StatusBadge status="rejected" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Statut: Rejeté');

    rerender(<StatusBadge status="exported" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Statut: Exporté');
  });
});

// ============================================================================
// AnomaliesAlert Accessibility Tests
// ============================================================================

describe('AnomaliesAlert Accessibility', () => {
  const anomalies = [
    { type: 'missing_field', message: 'Champ date manquant', severity: 'high' },
    { type: 'low_confidence', message: 'Confiance faible sur le montant', severity: 'medium' },
  ];

  it('should have role="alert"', () => {
    render(<AnomaliesAlert anomalies={anomalies} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('should have aria-live="polite" for screen reader announcements', () => {
    render(<AnomaliesAlert anomalies={anomalies} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('should have descriptive aria-label with count', () => {
    render(<AnomaliesAlert anomalies={anomalies} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-label', '2 anomalies détectées');
  });

  it('should use singular for single anomaly', () => {
    render(<AnomaliesAlert anomalies={[anomalies[0]]} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-label', '1 anomalie détectée');
  });

  it('should render nothing when no anomalies', () => {
    const { container } = render(<AnomaliesAlert anomalies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should hide decorative icons from screen readers', () => {
    render(<AnomaliesAlert anomalies={anomalies} />);

    const icons = document.querySelectorAll('[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DocumentNavigator Accessibility Tests
// ============================================================================

describe('DocumentNavigator Accessibility', () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  );

  it('should be a navigation landmark', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous="1" next="3" position={2} total={5} />
      </Wrapper>
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'Navigation entre documents');
  });

  it('should have accessible button labels', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous="1" next="3" position={2} total={5} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: 'Document précédent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Document suivant' })).toBeInTheDocument();
  });

  it('should announce position changes', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous="1" next="3" position={2} total={5} />
      </Wrapper>
    );

    const positionText = screen.getByText('2 / 5');
    expect(positionText).toHaveAttribute('aria-live', 'polite');
    expect(positionText).toHaveAttribute('aria-atomic', 'true');
  });

  it('should have screen reader text for position', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous="1" next="3" position={2} total={5} />
      </Wrapper>
    );

    expect(screen.getByText('Document')).toHaveClass('sr-only');
  });

  it('should disable buttons appropriately', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous={null} next="3" position={1} total={5} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: 'Document précédent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Document suivant' })).not.toBeDisabled();
  });

  it('should have visible focus indicators', () => {
    render(
      <Wrapper>
        <DocumentNavigator previous="1" next="3" position={2} total={5} />
      </Wrapper>
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button: HTMLButtonElement) => {
      expect(button.className).toContain('focus:ring-2');
    });
  });
});

// ============================================================================
// ErrorAlert Accessibility Tests
// ============================================================================

describe('ErrorAlert Accessibility', () => {
  const error = new Error('Test error message');

  it('should have role="alert"', () => {
    render(<ErrorAlert error={error} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('should have aria-live="assertive" for immediate announcement', () => {
    render(<ErrorAlert error={error} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('should render nothing when no error', () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should have accessible dismiss button', () => {
    const onDismiss = vi.fn();
    render(<ErrorAlert error={error} onDismiss={onDismiss} />);

    const dismissButton = screen.getByRole('button', { name: "Fermer l'alerte" });
    expect(dismissButton).toBeInTheDocument();
  });

  it('should have accessible retry button', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert error={error} onRetry={onRetry} />);

    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('FieldError Accessibility', () => {
  it('should have role="alert"', () => {
    render(<FieldError error="Ce champ est requis" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('should support id for aria-describedby', () => {
    render(<FieldError error="Ce champ est requis" id="email-error" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('id', 'email-error');
  });

  it('should render nothing when no error', () => {
    const { container } = render(<FieldError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ErrorToast Accessibility', () => {
  it('should have role="alert"', () => {
    const error = new Error('Network error');
    render(<ErrorToast error={error} onDismiss={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('should have aria-live="assertive"', () => {
    const error = new Error('Network error');
    render(<ErrorToast error={error} onDismiss={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('should have accessible close button', () => {
    const error = new Error('Network error');
    render(<ErrorToast error={error} onDismiss={() => {}} />);

    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });
});
