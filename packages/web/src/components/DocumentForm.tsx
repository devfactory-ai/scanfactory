import { useState, useEffect, useCallback, useMemo, memo, type ChangeEvent } from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';

interface FieldDisplayConfig {
  groups: Array<{
    name: string;
    label: string;
    fields: string[];
  }>;
}

interface DocumentFormProps {
  extractedData: Record<string, unknown>;
  fieldDisplay: FieldDisplayConfig | null;
  confidenceScores?: Record<string, number>;
  onChange: (data: Record<string, unknown>) => void;
  disabled?: boolean;
}

function formatFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Memoized field input component to prevent unnecessary re-renders
 */
interface FieldInputProps {
  name: string;
  label: string;
  value: unknown;
  confidence: number | null;
  disabled: boolean;
  onChange: (fieldName: string, value: string) => void;
}

const FieldInput = memo(function FieldInput({
  name,
  label,
  value,
  confidence,
  disabled,
  onChange,
}: FieldInputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(name, e.target.value);
    },
    [name, onChange]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <input
        id={name}
        type="text"
        value={renderFieldValue(value)}
        onChange={handleChange}
        disabled={disabled}
        className={`
          w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${confidence !== null && confidence < 0.7 ? 'border-red-300 bg-red-50' : 'border-gray-300'}
        `}
      />
    </div>
  );
});

export function DocumentForm({
  extractedData,
  fieldDisplay,
  confidenceScores = {},
  onChange,
  disabled = false,
}: DocumentFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(extractedData);

  useEffect(() => {
    setFormData(extractedData);
  }, [extractedData]);

  const handleFieldChange = useCallback(
    (fieldName: string, value: string) => {
      setFormData((prev) => {
        const newData = { ...prev, [fieldName]: value };
        onChange(newData);
        return newData;
      });
    },
    [onChange]
  );

  // Memoized fields computation
  const fields = useMemo(() => {
    const result: Array<{ name: string; label: string; value: unknown; confidence: number | null }> = [];

    if (fieldDisplay?.groups) {
      for (const group of fieldDisplay.groups) {
        for (const fieldName of group.fields) {
          if (fieldName in formData) {
            result.push({
              name: fieldName,
              label: formatFieldLabel(fieldName),
              value: formData[fieldName],
              confidence: confidenceScores[fieldName] ?? null,
            });
          }
        }
      }
    } else {
      // No display config, show all fields
      for (const [fieldName, value] of Object.entries(formData)) {
        if (typeof value !== 'object' || value === null) {
          result.push({
            name: fieldName,
            label: formatFieldLabel(fieldName),
            value,
            confidence: confidenceScores[fieldName] ?? null,
          });
        }
      }
    }

    return result;
  }, [formData, fieldDisplay, confidenceScores]);

  // Memoized grouped fields for rendering
  const groupedFields = useMemo(() => {
    if (!fieldDisplay?.groups) return null;

    return fieldDisplay.groups.map((group) => ({
      ...group,
      fields: group.fields
        .filter((fieldName) => fieldName in formData)
        .map((fieldName) => ({
          name: fieldName,
          label: formatFieldLabel(fieldName),
          value: formData[fieldName],
          confidence: confidenceScores[fieldName] ?? null,
        })),
    })).filter((group) => group.fields.length > 0);
  }, [fieldDisplay, formData, confidenceScores]);

  const renderGroups = () => {
    if (!groupedFields) {
      // Render flat list using memoized FieldInput
      return (
        <div className="space-y-4">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              name={field.name}
              label={field.label}
              value={field.value}
              confidence={field.confidence}
              disabled={disabled}
              onChange={handleFieldChange}
            />
          ))}
        </div>
      );
    }

    // Render grouped using memoized FieldInput
    return (
      <div className="space-y-6">
        {groupedFields.map((group) => (
          <div key={group.name}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">
              {group.label}
            </h3>
            <div className="space-y-3">
              {group.fields.map((field) => (
                <FieldInput
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  value={field.value}
                  confidence={field.confidence}
                  disabled={disabled}
                  onChange={handleFieldChange}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return <div className="h-full overflow-auto p-4">{renderGroups()}</div>;
}
