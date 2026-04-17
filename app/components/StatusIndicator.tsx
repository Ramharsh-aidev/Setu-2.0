/**
 * ============================================
 * STATUS INDICATOR COMPONENT
 * ============================================
 * Shows current state of the conversation
 */

'use client';

interface StatusIndicatorProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export default function StatusIndicator({ state }: StatusIndicatorProps) {
  const statusConfig: Record<
    string,
    { icon: string; label: string; color: string; animation: string }
  > = {
    idle: {
      icon: '⭕',
      label: 'Ready',
      color: 'text-gray-500',
      animation: '',
    },
    listening: {
      icon: '🎙️',
      label: 'Listening...',
      color: 'text-blue-500',
      animation: 'animate-pulse',
    },
    thinking: {
      icon: '🤔',
      label: 'Thinking...',
      color: 'text-purple-500',
      animation: 'animate-bounce',
    },
    speaking: {
      icon: '🔊',
      label: 'Speaking...',
      color: 'text-green-500',
      animation: 'animate-pulse',
    },
  };

  const config = statusConfig[state];

  return (
    <div className={`flex items-center gap-2 ${config.color} ${config.animation}`}>
      <span className="text-2xl">{config.icon}</span>
      <span className="font-medium text-sm">{config.label}</span>
    </div>
  );
}
