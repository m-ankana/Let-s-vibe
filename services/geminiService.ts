import { GoogleGenAI, Type } from "@google/genai";
import { Scenario, Correction, PronunciationFeedback } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Define the schema for the scenario generation
const scenarioSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A short, catchy title for the scenario." },
    description: { type: Type.STRING, description: "A brief description of the setting and situation." },
    userRole: { type: Type.STRING, description: "Who the user is playing (e.g., 'Customer')." },
    aiRole: { type: Type.STRING, description: "Who the AI is playing (e.g., 'Barista')." },
    location: { type: Type.STRING, description: "The physical location (e.g., 'Coffee Shop')." },
    systemInstruction: { type: Type.STRING, description: "Detailed instructions for the AI model to stay in character." },
    initialMessage: { type: Type.STRING, description: "The first sentence spoken by the AI to start the conversation in the target language." },
  },
  required: ["title", "description", "userRole", "aiRole", "location", "systemInstruction", "initialMessage"],
};

export const generateScenario = async (languageName: string, userName: string, avoidContext?: string): Promise<Scenario> => {
  try {
    let prompt = `
      Create a unique, immersive roleplay scenario for a language learner practicing ${languageName}.
      The learner's name is ${userName}.
      
      The scenario should be a specific, engaging real-world situation.
      
      Potential themes (Choose ONE that is distinctly different from the previous scenario if provided):
      - Commerce (Markets, Shops, bargaining)
      - Travel (Airports, Train stations, Taxis, Directions)
      - Hospitality (Hotels, Restaurants, Cafes)
      - Social (Parties, Meeting neighbors, Dates, Networking)
      - Services (Bank, Post office, Hairdresser, Doctor, Mechanic)
      - Emergencies (Lost item, Police, Pharmacy)
      - Professional (Job interview, Office small talk, Client meeting)
      - Housing (Renting, Repairs, Utilities)
    `;

    if (avoidContext) {
      prompt += `
      
      CRITICAL CONSTRAINT: 
      The previous scenario was: "${avoidContext}". 
      You MUST generate a scenario with a COMPLETELY DIFFERENT setting, role, and topic. 
      Do NOT repeat the same location or type of interaction.
      `;
    }

    prompt += `
      Requirements:
      1. The 'systemInstruction' must strictly instruct the AI to act as the 'aiRole'.
      2. The AI must speak ONLY in ${languageName}, unless the user is completely stuck, but primarily strict immersion.
      3. The 'initialMessage' must be in ${languageName}.
      4. The level should be intermediate - natural but clear.
      5. Make the 'title' creative and the 'description' engaging.
      6. The AI character is FEMALE. Ensure all grammatical gender agreement (verbs, adjectives) reflects a female speaker (e.g., in Hindi use 'karti hun', 'deti hun' not 'karta hun', 'deta hun').
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: scenarioSchema,
        thinkingConfig: { thinkingBudget: 0 } // Speed over deep reasoning for this creative task
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as Scenario;
  } catch (error) {
    console.error("Error generating scenario:", error);
    // Fallback scenario if API fails (or for dev without keys)
    return {
      title: "Cafe Encounter",
      description: "You are ordering a coffee in a busy cafe.",
      userRole: "Customer",
      aiRole: "Barista",
      location: "Cafe",
      systemInstruction: "You are a friendly female barista. Speak only in the target language. Use feminine grammatical forms.",
      initialMessage: "Hello! What can I get for you today?"
    };
  }
};

// Grammar Correction Service
const correctionSchema = {
  type: Type.OBJECT,
  properties: {
    original: { type: Type.STRING },
    corrected: { type: Type.STRING },
    explanation: { type: Type.STRING },
    isCorrect: { type: Type.BOOLEAN },
  },
  required: ["original", "corrected", "explanation", "isCorrect"],
};

export const validateGrammar = async (languageName: string, text: string, contextStr: string): Promise<Correction | null> => {
  try {
    const prompt = `
      You are a strict but helpful language tutor for ${languageName}.
      Context of conversation: ${contextStr}.
      
      Analyze this user input: "${text}"
      
      If the input is grammatically correct and natural, set isCorrect to true.
      If there are errors or awkward phrasing, set isCorrect to false, provide a corrected version, and a very brief (max 10 words) explanation.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: correctionSchema,
      }
    });
    
    const jsonStr = response.text;
    if (!jsonStr) return null;
    return JSON.parse(jsonStr) as Correction;
  } catch (error) {
    console.error("Grammar check error:", error);
    return null;
  }
};

// Pronunciation Analysis Service
const pronunciationSchema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER, description: "Score from 0 to 100 based on pronunciation accuracy." },
    feedback: { type: Type.STRING, description: "Brief constructive feedback on accent or clarity." },
    issues: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of words that were mispronounced." },
  },
  required: ["score", "feedback", "issues"],
};

// Helper to convert base64 PCM (16-bit, 16kHz) to base64 WAV
function pcmToWav(base64Pcm: string): string {
  const pcmData = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // Helper to write string to DataView
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF'); // RIFF identifier
  view.setUint32(4, 36 + pcmData.length, true); // file length
  writeString(view, 8, 'WAVE'); // RIFF type
  writeString(view, 12, 'fmt '); // format chunk identifier
  view.setUint32(16, 16, true); // format chunk length
  view.setUint16(20, 1, true); // sample format (raw)
  view.setUint16(22, 1, true); // channel count
  view.setUint32(24, 16000, true); // sample rate
  view.setUint32(28, 16000 * 2, true); // byte rate (sample rate * block align)
  view.setUint16(32, 2, true); // block align (channel count * bytes per sample)
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data'); // data chunk identifier
  view.setUint32(40, pcmData.length, true); // data chunk length

  const headerBytes = new Uint8Array(wavHeader);
  const wavBytes = new Uint8Array(headerBytes.length + pcmData.length);
  wavBytes.set(headerBytes, 0);
  wavBytes.set(pcmData, headerBytes.length);

  let binary = '';
  const len = wavBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(wavBytes[i]);
  }
  return btoa(binary);
}

export const evaluatePronunciation = async (languageName: string, base64Pcm: string): Promise<PronunciationFeedback | null> => {
  try {
    const base64Wav = pcmToWav(base64Pcm);
    
    const prompt = `
      Act as a strict language pronunciation coach for ${languageName}.
      Listen to the audio. 
      1. Provide a pronunciation score (0-100).
      2. Identify specifically which words were mispronounced (if any).
      3. Give 1 short sentence of constructive feedback on accent/tone.
      Be encouraging but honest.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Wav
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: pronunciationSchema,
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as PronunciationFeedback;
  } catch (error) {
    console.error("Pronunciation check error:", error);
    return null;
  }
};

export const createChatSession = (systemInstruction: string) => {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: systemInstruction,
    }
  });
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: ["AUDIO" as any], 
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};