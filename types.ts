export interface User {
  name: string;
}

export interface Language {
  id: string;
  name: string;
  flag: string;
  hello: string;
}

export interface Scenario {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  systemInstruction: string;
  initialMessage: string;
  location: string;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  isCorrect: boolean;
}

export interface PronunciationFeedback {
  score: number;
  feedback: string;
  issues: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  audioData?: string;
  isStreaming?: boolean;
  correction?: Correction;
  pronunciation?: PronunciationFeedback;
}

export type AppView = 'login' | 'select-language' | 'loading-scenario' | 'chat';