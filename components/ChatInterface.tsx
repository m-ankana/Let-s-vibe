import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Message, Scenario, User, Language, Correction } from '../types';
import { Send, User as UserIcon, Bot, ArrowLeft, Mic, AlertCircle, StopCircle, Sparkles, Volume2, Loader2, Ear } from 'lucide-react';
import { generateSpeech, validateGrammar, evaluatePronunciation } from '../services/geminiService';

interface ChatInterfaceProps {
  user: User;
  language: Language;
  scenario: Scenario;
  onBack: () => void;
}

// --- Audio Utils ---

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ user, language, scenario, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<any>(null); // LiveSession type is inferred
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isRecordingRef = useRef(false);
  
  // Audio recording buffers
  const userAudioChunksRef = useRef<Float32Array[]>([]);
  const lastUserMessageIdRef = useRef<string | null>(null);
  
  // Temporary transcription buffers
  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');

  // Grammar check helper
  const handleGrammarCheck = async (msgId: string, text: string) => {
    if (!text || text.length < 2) return;
    
    // Slight delay to not block UI
    setTimeout(async () => {
      const correction = await validateGrammar(language.name, text, scenario.description);
      if (correction && !correction.isCorrect) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, correction } : m));
      }
    }, 100);
  };

  // Replay Audio Helper
  const handlePlayAudio = async (msgId: string, text: string) => {
    if (playingMessageId) return;
    setPlayingMessageId(msgId);
    
    try {
      const msg = messages.find(m => m.id === msgId);
      let audioData = null;
      let sampleRate = 24000;

      // Prefer user's original recording if available
      if (msg?.audioData) {
        audioData = msg.audioData;
        sampleRate = 16000; // User recordings are at 16kHz
      } else {
        // Fallback to TTS (for AI messages or typed user messages)
        audioData = await generateSpeech(text);
        sampleRate = 24000; // Gemini TTS is typically 24kHz
      }

      if (audioData && audioContextRef.current) {
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
            await ctx.resume().catch(() => {});
        }
        
        const audioBuffer = await decodeAudioData(decode(audioData), ctx, sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setPlayingMessageId(null);
        source.start(0);
      } else {
        setPlayingMessageId(null);
      }
    } catch (error) {
      console.error("Audio replay error:", error);
      setPlayingMessageId(null);
    }
  };

  // Initialize Live Session
  useEffect(() => {
    let cleanup = false;
    
    const initLiveSession = async () => {
      try {
        const apiKey = process.env.API_KEY || '';
        const ai = new GoogleGenAI({ apiKey });
        
        // Initialize Output Audio Context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // Play Initial Greeting
        const playGreeting = async () => {
          if (!scenario.initialMessage) return;
          try {
             // Generate speech for the initial text
             const audioData = await generateSpeech(scenario.initialMessage);
             
             if (audioData && audioContextRef.current && !cleanup) {
               const ctx = audioContextRef.current;
               // Attempt to resume if suspended (likely needed if no immediate user gesture)
               if (ctx.state === 'suspended') {
                 await ctx.resume().catch(() => {});
               }
               
               const audioBuffer = await decodeAudioData(decode(audioData), ctx);
               const source = ctx.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(ctx.destination);
               source.start(0);
               
               // Update the scheduler so subsequent Live API audio plays after this
               nextStartTimeRef.current = ctx.currentTime + audioBuffer.duration;
             }
          } catch (e) {
            console.error("Error playing greeting:", e);
          }
        };
        playGreeting();
        
        // Initial Message (UI Only)
        setMessages([{
            id: 'init-1',
            role: 'model',
            text: scenario.initialMessage,
            timestamp: Date.now(),
            isStreaming: false
        }]);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: `
              ${scenario.systemInstruction}
              You are roleplaying with ${user.name}. 
              Your role: ${scenario.aiRole}. 
              User role: ${scenario.userRole}.
              Location: ${scenario.location}.
              
              CRITICAL INSTRUCTION:
              You are a FEMALE character. You MUST use feminine grammatical forms for yourself (e.g., in Hindi: "karti hun", "deti hun", "meri").
              You MUST speak ONLY in ${language.name}.
              Do NOT speak English under any circumstances, even if the user speaks English.
              Maintain strict immersion in ${language.name}.
              Keep responses concise, natural, and conversational.
            `,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
          },
          callbacks: {
            onopen: () => {
              if (!cleanup) setIsConnected(true);
              console.log("Live session connected");
            },
            onmessage: async (message: LiveServerMessage) => {
              if (cleanup) return;

              // Handle Audio Output
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && audioContextRef.current) {
                const ctx = audioContextRef.current;
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                // Schedule next chunk
                const currentTime = ctx.currentTime;
                const startTime = Math.max(nextStartTimeRef.current, currentTime);
                source.start(startTime);
                nextStartTimeRef.current = startTime + audioBuffer.duration;
              }

              // Handle Transcription (Real-time Streaming)
              const outputText = message.serverContent?.outputTranscription?.text;
              const inputText = message.serverContent?.inputTranscription?.text;

              if (outputText || inputText) {
                if (inputText) currentInputTransRef.current += inputText;
                if (outputText) currentOutputTransRef.current += outputText;

                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMsg = newMessages[newMessages.length - 1];

                  // Model Output Streaming
                  if (outputText) {
                     if (lastMsg && lastMsg.role === 'model' && lastMsg.isStreaming) {
                        return [
                          ...prev.slice(0, -1),
                          { ...lastMsg, text: lastMsg.text + outputText }
                        ];
                     } else {
                        // Start new model message
                        return [...prev, {
                          id: Date.now().toString(),
                          role: 'model',
                          text: outputText,
                          timestamp: Date.now(),
                          isStreaming: true
                        }];
                     }
                  }

                  // User Input Streaming (Only if recording)
                  if (inputText && isRecordingRef.current) {
                     if (lastMsg && lastMsg.role === 'user' && lastMsg.isStreaming) {
                        return [
                          ...prev.slice(0, -1),
                          { ...lastMsg, text: lastMsg.text + inputText }
                        ];
                     } else {
                        // Start new user message from speech
                        const newId = Date.now().toString();
                        lastUserMessageIdRef.current = newId; // Track this ID to attach audio later
                        return [...prev, {
                          id: newId,
                          role: 'user',
                          text: inputText,
                          timestamp: Date.now(),
                          isStreaming: true
                        }];
                     }
                  }
                  return prev;
                });
              }

              // Handle Turn Complete (Finalize Streaming State)
              if (message.serverContent?.turnComplete) {
                setMessages(prev => prev.map(m => 
                  m.isStreaming ? { ...m, isStreaming: false } : m
                ));
                
                // Trigger grammar check for user input
                if (currentInputTransRef.current.trim()) {
                   // Find the latest user message id to attach correction
                   const userText = currentInputTransRef.current.trim();
                   setMessages(currentMsgs => {
                      const lastUserMsg = [...currentMsgs].reverse().find(m => m.role === 'user' && m.text.includes(userText.substring(0, 10)));
                      if (lastUserMsg) {
                          handleGrammarCheck(lastUserMsg.id, userText);
                      }
                      return currentMsgs;
                   });
                }
                
                currentInputTransRef.current = '';
                currentOutputTransRef.current = '';
              }
            },
            onerror: (e) => {
               console.error("Live session error:", e);
               if (!cleanup) setConnectionError("Connection interrupted. Check console.");
            },
            onclose: () => {
               if (!cleanup) setIsConnected(false);
            }
          }
        });
        
        sessionRef.current = sessionPromise;
      } catch (err) {
        console.error("Failed to init live session", err);
        setConnectionError("Failed to connect to AI service");
      }
    };

    initLiveSession();

    return () => {
      cleanup = true;
      if (sessionRef.current) {
          sessionRef.current.then((s: any) => s.close());
      }
      if (audioContextRef.current) audioContextRef.current.close();
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRecording]);

  const startRecording = async () => {
    if (!isConnected) return;
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const source = inputContextRef.current.createMediaStreamSource(stream);
      const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Reset chunk buffer
      userAudioChunksRef.current = [];
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy buffer because inputBuffer is reused
        userAudioChunksRef.current.push(new Float32Array(inputData));
        
        const blob = createBlob(inputData);
        
        if (sessionRef.current) {
            sessionRef.current.then((session: any) => {
                session.sendRealtimeInput({ media: blob });
            });
        }
      };

      source.connect(processor);
      processor.connect(inputContextRef.current.destination);
      processorRef.current = processor;
      
      setIsRecording(true);
      isRecordingRef.current = true;
      currentInputTransRef.current = ''; // Reset buffer on new recording
    } catch (err) {
      console.error("Mic error:", err);
      setConnectionError("Microphone access failed");
    }
  };

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    
    // Process recorded audio and attach to the message
    if (userAudioChunksRef.current.length > 0 && lastUserMessageIdRef.current) {
        // Flatten chunks
        const totalLen = userAudioChunksRef.current.reduce((acc, c) => acc + c.length, 0);
        const merged = new Float32Array(totalLen);
        let offset = 0;
        userAudioChunksRef.current.forEach(c => {
            merged.set(c, offset);
            offset += c.length;
        });
        
        // Encode to base64 pcm (int16)
        const base64Audio = createBlob(merged).data;
        
        // Update the message state with the audio data
        const targetId = lastUserMessageIdRef.current;
        setMessages(prev => prev.map(m => 
            m.id === targetId ? { ...m, audioData: base64Audio } : m
        ));

        // Trigger Pronunciation Analysis in Background
        evaluatePronunciation(language.name, base64Audio).then(feedback => {
            if (feedback) {
                setMessages(prev => prev.map(m => 
                    m.id === targetId ? { ...m, pronunciation: feedback } : m
                ));
            }
        });
    }

    setIsRecording(false);
    isRecordingRef.current = false;
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !isConnected) return;
    
    const text = inputText.trim();
    setInputText('');
    
    const newMsgId = Date.now().toString();

    // Add optimistic message (Not streaming, finalized immediately)
    setMessages(prev => [...prev, {
        id: newMsgId,
        role: 'user',
        text: text,
        timestamp: Date.now(),
        isStreaming: false
    }]);

    // Trigger grammar check immediately for typed text
    handleGrammarCheck(newMsgId, text);

    // Resume audio context
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }

    if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
            session.send({ parts: [{ text: text }], turnComplete: true });
        });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Header */}
      <div className="bg-indigo-600 text-white p-4 shadow-md z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button onClick={onBack} className="p-2 hover:bg-indigo-500 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 px-4 text-center">
                <h2 className="font-bold text-lg">{scenario.title}</h2>
                <div className="text-indigo-200 text-xs flex items-center justify-center gap-2">
                    <span className="bg-indigo-700 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">{scenario.location}</span>
                    <span className="flex items-center gap-1">
                         {isConnected ? <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> : <span className="w-2 h-2 bg-red-400 rounded-full"></span>}
                         Live
                    </span>
                </div>
            </div>
            <div className="w-9"></div> 
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
            
          <div className="flex justify-center my-6">
             <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm px-4 py-2 rounded-full shadow-sm max-w-md text-center">
               Scenario: {scenario.description}
             </div>
          </div>

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex flex-col w-full ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                  
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                    {isUser ? <UserIcon className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
                  </div>

                  <div className={`
                    p-3.5 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm transition-all duration-200 relative
                    ${isUser 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                    }
                    ${msg.isStreaming && !isUser ? 'animate-pulse' : ''}
                  `}>
                    {msg.text}
                    {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-current opacity-50 animate-blink">|</span>}
                  </div>

                  {/* Play Audio Button */}
                  {!msg.isStreaming && (
                    <button
                        onClick={() => handlePlayAudio(msg.id, msg.text)}
                        disabled={!!playingMessageId}
                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${
                            isUser 
                            ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' 
                            : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                        }`}
                        title="Listen again"
                    >
                         {playingMessageId === msg.id ? (
                             <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                         ) : (
                             <Volume2 className="w-4 h-4" />
                         )}
                    </button>
                  )}
                </div>

                {/* Pronunciation Feedback */}
                {msg.pronunciation && (
                    <div className={`mt-2 max-w-[80%] md:max-w-[65%] ${isUser ? 'mr-10' : 'ml-10'}`}>
                        <div className={`border rounded-xl p-3 text-xs shadow-sm animate-in fade-in slide-in-from-top-2 ${
                            msg.pronunciation.score > 85 ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-amber-50 border-amber-100 text-amber-900'
                        }`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Ear className={`w-4 h-4 ${msg.pronunciation.score > 85 ? 'text-emerald-500' : 'text-amber-500'}`} />
                                <span className="font-bold">Pronunciation Score: {msg.pronunciation.score}%</span>
                            </div>
                            <p className="mb-1">{msg.pronunciation.feedback}</p>
                            {msg.pronunciation.issues.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-black/5">
                                    <span className="font-semibold">Watch out for:</span> {msg.pronunciation.issues.join(", ")}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Correction Box */}
                {msg.correction && (
                  <div className={`mt-2 max-w-[80%] md:max-w-[65%] ${isUser ? 'mr-10' : 'ml-10'}`}>
                     <div className="bg-indigo-50/80 backdrop-blur-sm border border-indigo-100 rounded-xl p-3 text-xs text-indigo-900 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-start gap-2">
                           <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                           <div className="flex flex-col gap-1">
                              <span className="font-semibold text-indigo-700">Suggestion:</span>
                              <span className="text-slate-700">{msg.correction.corrected}</span>
                              <span className="text-slate-500 italic border-t border-indigo-200/50 pt-1 mt-1">{msg.correction.explanation}</span>
                           </div>
                        </div>
                     </div>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4 sticky bottom-0 z-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {connectionError && (
             <div className="flex items-center gap-2 text-xs text-red-500 px-4">
               <AlertCircle className="w-3 h-3" />
               {connectionError}
             </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!isConnected}
              className={`p-4 rounded-full transition-all duration-300 shadow-md border ${
                isRecording 
                  ? 'bg-red-500 text-white border-red-600 ring-4 ring-red-100 scale-110' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRecording ? <StopCircle className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
            </button>
            
            <form onSubmit={handleSendMessage} className="flex-1 relative flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isRecording ? "Listening..." : `Type in ${language.name}...`}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-full px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all pr-12"
                disabled={isRecording || !isConnected}
              />
              <button 
                type="submit"
                disabled={!inputText.trim() || isRecording || !isConnected}
                className="absolute right-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};