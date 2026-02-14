import { GoogleGenAI, Type } from "@google/genai";
import { Scenario } from "../types";

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
      systemInstruction: "You are a friendly barista. Speak only in the target language.",
      initialMessage: "Hello! What can I get for you today?"
    };
  }
};

// We will manage the chat session instance within the React component using a Ref to persist it,
// but we export the client creation helper here.
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