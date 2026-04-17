/**
 * ============================================
 * ENTITY EXTRACTOR COMPONENT
 * ============================================
 * Displays extracted user information/entities
 */

'use client';

interface EntityExtractorProps {
  entities: Record<string, unknown>;
}

export default function EntityExtractor({ entities }: EntityExtractorProps) {
  if (!entities || Object.keys(entities).length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold text-gray-900 mb-3">👤 About You</h3>
        <p className="text-sm text-gray-500">
          Information will appear here as you tell Setu about yourself.
        </p>
      </div>
    );
  }

  const formatLabel = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };


  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
        <span className="text-xl">👤</span>
        About You
      </h3>

      <div className="space-y-2">
        {Object.entries(entities).map(([key, value]) => {
          if (value === null || value === undefined) return null;

          let displayValue = value;
          if (typeof value === 'number' && key === 'income') {
            displayValue = `₹${value.toLocaleString('en-IN')}`;
          } else if (Array.isArray(value)) {
            displayValue = value.join(', ');
          }

          return (
            <div key={key} className="pb-2 border-b border-gray-200 last:border-b-0">
              <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                {formatLabel(key)}
              </div>
              <div className="text-sm text-gray-900 font-semibold mt-1">
                {String(displayValue)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
