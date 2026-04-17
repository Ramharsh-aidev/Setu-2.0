
'use client';

import { useEffect, useRef, useState } from 'react';
import VapiClient from '@/app/components/VapiClient';
import ConversationDisplay from '@/app/components/ConversationDisplay';
import SchemeRecommendations from '@/app/components/SchemeRecommendations';
import StatusIndicator from '@/app/components/StatusIndicator';
import EntityExtractor from '@/app/components/EntityExtractor';

type ExtractedEntities = Record<string, unknown>;

interface SchemeRecommendation {
  name: string;
  description: string;
  url: string;
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [conversationState, setConversationState] = useState<
    'idle' | 'listening' | 'thinking' | 'speaking'
  >('idle');
  const [transcript, setTranscript] = useState<
    Array<{ speaker: 'user' | 'ai'; text: string; timestamp: number }>
  >([]);
  const [extractedEntities, setExtractedEntities] = useState<ExtractedEntities>({});
  const [recommendations, setRecommendations] = useState<SchemeRecommendation[]>([]);
  const [language, setLanguage] = useState<string>('en');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleTranscriptUpdate = (newMessage: {
    speaker: 'user' | 'ai';
    text: string;
  }) => {
    setTranscript(prev => [
      ...prev,
      {
        ...newMessage,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleStateChange = (
    state: 'idle' | 'listening' | 'thinking' | 'speaking'
  ) => {
    setConversationState(state);
  };

  const handleEntitiesExtracted = (entities: ExtractedEntities) => {
    setExtractedEntities(prev => ({
      ...prev,
      ...entities,
    }));
  };

  const handleRecommendationsReceived = (schemes: SchemeRecommendation[]) => {
    setRecommendations(schemes);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-blue-100 p-4">
      {/* Header */}
      <header className="mb-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">🎤 Setu</h1>
              <p className="text-gray-600 mt-1">
                Your Voice Guide to Government Schemes
              </p>
            </div>
            <div className="flex gap-4">
              <select
                aria-label="Choose conversation language"
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-medium hover:border-gray-400 transition"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="mr">मराठी (Marathi)</option>
                <option value="ta">தமிழ் (Tamil)</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto">
        {!sessionId ? (
          // Initial Start Screen
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="mb-8">
              <div className="inline-block text-6xl mb-4">🎙️</div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Welcome to Setu
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Talk to Setu to discover government schemes that are right for you.
              Just start speaking about your life and needs.
            </p>

            <VapiClient
              onSessionStart={setSessionId}
              onTranscriptUpdate={handleTranscriptUpdate}
              onStateChange={handleStateChange}
              onEntitiesExtracted={handleEntitiesExtracted}
              onRecommendationsReceived={handleRecommendationsReceived}
              language={language}
            />

            <p className="text-sm text-gray-500 mt-8">
              Your privacy is protected. Nothing is stored without permission.
            </p>
          </div>
        ) : (
          // Active Conversation
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Conversation */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col h-150">
                {/* Conversation Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-linear-to-b from-white to-gray-50">
                  {transcript.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <div className="text-4xl mb-2">👂</div>
                        <p>Listening to you...</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ConversationDisplay transcript={transcript} />
                      <div ref={transcriptEndRef} />
                    </>
                  )}
                </div>

                {/* Vapi Controls */}
                <div className="p-6 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <StatusIndicator state={conversationState} />
                    </div>

                    <VapiClient
                      sessionId={sessionId}
                      onSessionStart={setSessionId}
                      onTranscriptUpdate={handleTranscriptUpdate}
                      onStateChange={handleStateChange}
                      onEntitiesExtracted={handleEntitiesExtracted}
                      onRecommendationsReceived={handleRecommendationsReceived}
                      language={language}
                      isActive={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Sidebar */}
            <div className="space-y-6">
              {/* Extracted Entities */}
              <EntityExtractor entities={extractedEntities} />

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <SchemeRecommendations schemes={recommendations} />
              )}

              {/* Status Card */}
              <div className="bg-white rounded-xl shadow p-4">
                <h3 className="font-bold text-gray-900 mb-3">Session Info</h3>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-gray-600">Session ID</dt>
                    <dd className="text-gray-900 font-mono text-xs truncate">
                      {sessionId.substring(0, 8)}...
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Messages</dt>
                    <dd className="text-gray-900">{transcript.length}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Language</dt>
                    <dd className="text-gray-900 capitalize">{language}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 text-center text-sm text-gray-600">
        <p>
          Setu • Powered by Vapi, Qdrant & Hugging Face •{' '}
          <a
            href="#"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Privacy Policy
          </a>
        </p>
      </footer>
    </div>
  );
}

