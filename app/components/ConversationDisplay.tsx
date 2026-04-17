/**
 * ============================================
 * CONVERSATION DISPLAY COMPONENT
 * ============================================
 * Displays the conversation transcript
 */

'use client';

interface ConversationMessage {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface ConversationDisplayProps {
  transcript: ConversationMessage[];
}

export default function ConversationDisplay({
  transcript,
}: ConversationDisplayProps) {
  return (
    <div className="space-y-4">
      {transcript.map((message, index) => (
        <div
          key={index}
          className={`flex ${message.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
              message.speaker === 'user'
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-gray-200 text-gray-900 rounded-bl-none'
            }`}
          >
            <p className="text-sm leading-relaxed">{message.text}</p>
            <p
              className={`text-xs mt-1 ${
                message.speaker === 'user'
                  ? 'text-blue-100'
                  : 'text-gray-500'
              }`}
            >
              {new Date(message.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
