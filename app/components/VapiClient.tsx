/**
 * ============================================
 * VAPI CLIENT COMPONENT
 * ============================================
 * Handles voice interaction with Vapi service
 */

'use client';

import { useEffect, useState, useRef } from 'react';

type ConversationState = 'idle' | 'listening' | 'thinking' | 'speaking';

type ExtractedEntities = Record<string, unknown>;

interface SchemeRecommendation {
  name: string;
  description: string;
  url: string;
  [key: string]: unknown;
}

interface VapiMessage {
  type: string;
  transcription?: string;
  message?: string;
  response?: {
    sessionMetadata?: {
      extractedEntities?: ExtractedEntities;
    };
    eligibleSchemes?: SchemeRecommendation[];
  };
}

interface VapiWebClient {
  on: (event: string, handler: (payload: unknown) => void) => void;
  start: (config: {
    phoneNumber?: string;
    assistantOverrides?: {
      firstMessage?: string;
    };
    customData?: {
      sessionId: string;
      language: string;
    };
  }) => Promise<void>;
  stop: () => Promise<void>;
}

interface VapiClientProps {
  sessionId?: string;
  onSessionStart: (sessionId: string) => void;
  onTranscriptUpdate: (message: { speaker: 'user' | 'ai'; text: string }) => void;
  onStateChange: (state: ConversationState) => void;
  onEntitiesExtracted: (entities: ExtractedEntities) => void;
  onRecommendationsReceived: (schemes: SchemeRecommendation[]) => void;
  language: string;
  isActive?: boolean;
}

export default function VapiClient({
  sessionId: initialSessionId,
  onSessionStart,
  onTranscriptUpdate,
  onStateChange,
  onEntitiesExtracted,
  onRecommendationsReceived,
  language,
  isActive = false,
}: VapiClientProps) {
  const [isListening, setIsListening] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId || '');
  const vapiRef = useRef<VapiWebClient | null>(null);

  // Initialize Vapi
  useEffect(() => {
    const initializeVapi = async () => {
      try {
        const Vapi = (await import('@vapi-ai/web')).default;

        vapiRef.current = new Vapi({
          publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
        });

        // Set up event listeners
        vapiRef.current.on('call-start', () => {
          console.log('🔴 Call started');
          onStateChange('listening');
        });

        vapiRef.current.on('call-end', () => {
          console.log('🟢 Call ended');
          setIsListening(false);
          onStateChange('idle');
        });

        vapiRef.current.on('message', payload => {
          const message = payload as VapiMessage;
          console.log('📨 Message received:', message);

          if (message.type === 'user-transcription') {
            onTranscriptUpdate({
              speaker: 'user',
              text: message.transcription || '',
            });
          } else if (message.type === 'assistant-message') {
            onTranscriptUpdate({
              speaker: 'ai',
              text: message.message || '',
            });

            // Extract entities and recommendations from response
            if (message.response?.sessionMetadata?.extractedEntities) {
              onEntitiesExtracted(message.response.sessionMetadata.extractedEntities);
            }

            if (message.response?.eligibleSchemes) {
              onRecommendationsReceived(message.response.eligibleSchemes);
            }
          } else if (message.type === 'speech-start') {
            onStateChange('speaking');
          } else if (message.type === 'speech-end') {
            onStateChange('thinking');
          }
        });

        vapiRef.current.on('error', error => {
          console.error('❌ Vapi Error:', error);
          onStateChange('idle');
        });
      } catch (error) {
        console.error('Failed to initialize Vapi:', error);
      }
    };

    if (!vapiRef.current) {
      initializeVapi();
    }
  }, []);

  // Start conversation
  const handleStartConversation = async () => {
    try {
      let activeSessionId = sessionId;

      if (!activeSessionId) {
        // Create new session via backend
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/vapi/session/start`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: language,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create Vapi session');
        }

        const data = await response.json();
        const newSessionId = data.sessionId;
        setSessionId(newSessionId);
        onSessionStart(newSessionId);
        activeSessionId = newSessionId;
      }

      // Start Vapi call
      if (vapiRef.current) {
        await vapiRef.current.start({
          phoneNumber: undefined, // For web, this can be undefined
          assistantOverrides: {
            firstMessage: getFirstMessage(language),
          },
          customData: {
            sessionId: activeSessionId,
            language: language,
          },
        });

        setIsListening(true);
        onStateChange('listening');
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
      onStateChange('idle');
    }
  };

  // End conversation
  const handleEndConversation = async () => {
    try {
      if (vapiRef.current) {
        await vapiRef.current.stop();
      }

      // End session via backend
      if (sessionId) {
        await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/vapi/session/end`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }
        );
      }

      setIsListening(false);
      onStateChange('idle');
    } catch (error) {
      console.error('Error ending conversation:', error);
    }
  };

  return (
    <button
      onClick={isListening ? handleEndConversation : handleStartConversation}
      className={`px-8 py-4 rounded-full font-bold text-white text-lg transition-all duration-300 flex items-center gap-2 ${
        isListening
          ? 'bg-red-500 hover:bg-red-600 shadow-lg scale-105'
          : 'bg-linear-to-r from-blue-500 to-purple-600 hover:shadow-lg transform hover:scale-105'
      }`}
    >
      {isListening ? (
        <>
          <span className="inline-block w-3 h-3 bg-white rounded-full animate-pulse"></span>
          Stop Listening
        </>
      ) : (
        <>
          🎤 Start Listening
        </>
      )}
    </button>
  );
}

// Get localized first message
function getFirstMessage(language: string): string {
  const messages: Record<string, string> = {
    en: "Hello, I'm Setu. Tell me about yourself - your occupation, income, location - and I'll help you find government schemes you're eligible for.",
    hi: 'नमस्ते, मैं सेतु हूँ। मुझे अपने बारे में बताएं - आपका काम, आय, स्थान - और मैं आपको सरकारी योजनाएं खोजने में मदद करूंगा।',
    mr: 'नमस्कार, मी सेतु आहे. मला आपल्या बद्दल सांगा - आपले व्यवसाय, उत्पन्न, स्थान - आणि मी आपल्याला सरकारी योजना शोधण्यास मदत करीन.',
    ta: 'வணக்கம், நான் சேது. உங்களைப் பற்றி சொல்லுங்கள் - உங்கள் தொழில், வருமானம், இருப்பிடம் - மேலும் நான் உங்களுக்கு அரசு திட்டங்களைக் கண்டறிய உதவுகிறேன்.',
  };

  return messages[language] || messages.en;
}
