import { Language } from './types';

export const SUPPORTED_LANGUAGES: Language[] = [
  { id: 'es-ES', name: 'Spanish', flag: '🇪🇸', hello: 'Hola' },
  { id: 'fr-FR', name: 'French', flag: '🇫🇷', hello: 'Bonjour' },
  { id: 'de-DE', name: 'German', flag: '🇩🇪', hello: 'Hallo' },
  { id: 'it-IT', name: 'Italian', flag: '🇮🇹', hello: 'Ciao' },
  { id: 'ja-JP', name: 'Japanese', flag: '🇯🇵', hello: 'こんにちは' },
  { id: 'ko-KR', name: 'Korean', flag: '🇰🇷', hello: '안녕하세요' },
  { id: 'zh-CN', name: 'Chinese (Mandarin)', flag: '🇨🇳', hello: '你好' },
  { id: 'pt-BR', name: 'Portuguese', flag: '🇧🇷', hello: 'Olá' },
  // Indian Languages
  { id: 'hi-IN', name: 'Hindi', flag: '🇮🇳', hello: 'नमस्ते' },
  { id: 'bn-IN', name: 'Bengali', flag: '🇮🇳', hello: 'নমস্কার' },
  { id: 'mr-IN', name: 'Marathi', flag: '🇮🇳', hello: 'नमस्कार' },
  { id: 'ta-IN', name: 'Tamil', flag: '🇮🇳', hello: 'வணக்கம்' },
  { id: 'te-IN', name: 'Telugu', flag: '🇮🇳', hello: 'నమస్కారం' },
  { id: 'gu-IN', name: 'Gujarati', flag: '🇮🇳', hello: 'નમસ્તે' },
  { id: 'kn-IN', name: 'Kannada', flag: '🇮🇳', hello: 'ನಮಸ್ಕಾರ' },
  { id: 'ml-IN', name: 'Malayalam', flag: '🇮🇳', hello: 'നമസ്കാരം' },
];

export const INITIAL_GREETING = "Welcome back! Ready to learn?";