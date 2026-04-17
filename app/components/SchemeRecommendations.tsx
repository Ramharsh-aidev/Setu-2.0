/**
 * ============================================
 * SCHEME RECOMMENDATIONS COMPONENT
 * ============================================
 * Displays recommended government schemes
 */

'use client';

interface Scheme {
  name: string;
  description: string;
  url: string;
}

interface SchemeRecommendationsProps {
  schemes: Scheme[];
}

export default function SchemeRecommendations({
  schemes,
}: SchemeRecommendationsProps) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">✨</span>
        Recommended Schemes
      </h3>

      <div className="space-y-3">
        {schemes.map((scheme, index) => (
          <div key={index} className="p-3 bg-linear-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 hover:border-green-400 transition">
            <h4 className="font-semibold text-sm text-gray-900 mb-1">
              {scheme.name}
            </h4>
            <p className="text-xs text-gray-600 mb-2 line-clamp-2">
              {scheme.description}
            </p>
            <a
              href={scheme.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 font-medium hover:text-green-800 underline"
            >
              Learn More →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
