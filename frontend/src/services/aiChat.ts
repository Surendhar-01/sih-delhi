import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const DEFAULT_GEMINI_MODEL =
  import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

export async function chatWithAegis(
  systemContext: string,
  userMessage: string,
) {
  if (!ai)
    return "AI capabilities are offline. Please configure VITE_GEMINI_API_KEY.";

  try {
    const prompt = `
      ROLE: AEGIS (Advanced Emergency Geospatial Intelligence System) Command Assistant.
      
      SYSTEM STATUS CONTEXT:
      ${systemContext}
      
      USER QUERY: "${userMessage}"
      
      INSTRUCTIONS:
      - You are a tactical operation assistant.
      - Be concise, direct, and professional.
      - Prioritize victim safety and resource efficiency.
      - If asked about status, use the provided context.
      - Do not hallucinate resources not listed in the context.
    `;

    const result = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return (
      result.text ||
      "Communication link with AI core unstable. Please try again."
    );
  } catch (error: any) {
    console.error("AI Error:", error);
    // Return the actual error to help with debugging
    return `AI System Error: ${error.message || "Connection failed"}`;
  }
}
