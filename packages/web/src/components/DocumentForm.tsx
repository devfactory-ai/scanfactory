import { useState, useEffect, type ChangeEvent } from 'react';
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

  const handleFieldChange = (fieldName: string, value: string) => {
    const newData = { ...formData, [fieldName]: value };
    setFormData(newData);
    onChange(newData);
  };

  // Get all fields organized by groups or flat if no display config
  const getFields = (): Array<{ name: string; label: string; value: unknown; confidence: number | null }> => {
    const fields: Array<{ name: string; label: string; value: unknown; confidence: number | null }> = [];

    if (fieldDisplay?.groups) {
      for (const group of fieldDisplay.groups) {
        for (const fieldName of group.fields) {
          if (fieldName in formData) {
            fields.push({
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
          fields.push({
            name: fieldName,
            label: formatFieldLabel(fieldName),
            value,
            confidence: confidenceScores[fieldName] ?? null,
          });
        }
      }
    }

    return fields;
  };

  const renderGroups = () => {
    if (!fieldDisplay?.groups) {
      // Render flat list
      return (
        <div className="space-y-4">
          {getFields().map((field) => (
            <div key={field.name}>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-gray-700"
                >
                  {field.label}
                </label>
                <ConfidenceBadge confidence={field.confidence} />
              </div>
              <input
                id={field.name}
                type="text"
                value={renderFieldValue(field.value)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange(field.name, e.target.value)
                }
                disabled={disabled}
                className={`
                  w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                  ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
                  ${field.confidence !== null && field.confidence < 0.7 ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                `}
              />
            </div>
          ))}
        </div>
      );
    }

    // Render grouped
    return (
      <div className="space-y-6">
        {fieldDisplay.groups.map((group) => {
          const groupFields = group.fields
            .filter((fieldName) => fieldName in formData)
            .map((fieldName) => ({
              name: fieldName,
              label: formatFieldLabel(fieldName),
              value: formData[fieldName],
              confidence: confidenceScores[fieldName] ?? null,
            }));

          if (groupFields.length === 0) return null;

          return (
            <div key={group.name}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">
                {group.label}
              </h3>
              <div className="space-y-3">
                {groupFields.map((field) => (
                  <div key={field.name}>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor={field.name}
                        className="block text-sm font-medium text-gray-700"
                      >
                        {field.label}
                      </label>
                      <ConfidenceBadge confidence={field.confidence} />
                    </div>
                    <input
                      id={field.name}
                      type="text"
                      value={renderFieldValue(field.value)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleFieldChange(field.name, e.target.value)
                      }
                      disabled={disabled}
                      className={`
                        w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                        ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
                        ${field.confidence !== null && field.confidence < 0.7 ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                      `}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return <div className="h-full overflow-auto p-4">{renderGroups()}</div>;
}
