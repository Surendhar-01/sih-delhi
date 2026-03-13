import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const PRIMARY_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
export const FALLBACK_MODEL = import.meta.env.VITE_GEMINI_FALLBACK_MODEL || "gemini-1.5-flash";

export interface AIResponse {
  text: string;
  modelUsed: string;
  isFallback: boolean;
}

/**
 * Executes a generative AI request with automatic fallback on 429 Resource Exhausted errors.
 */
export async function generateWithFallback(
  options: {
    prompt?: string;
    parts?: any[];
    config?: any;
  }
): Promise<AIResponse> {
  if (!ai) {
    throw new Error("AI capabilities are offline. Please configure VITE_GEMINI_API_KEY.");
  }

  const { prompt, parts, config } = options;
  const contents = parts ? [{ role: "user", parts }] : [{ role: "user", parts: [{ text: prompt || "" }] }];

  try {
    // Attempt with Primary Model
    const result = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents,
      config,
    });
    
    return {
      text: result.text || "",
      modelUsed: PRIMARY_MODEL,
      isFallback: false
    };
  } catch (error: any) {
    const isQuotaError = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota");
    
    if (isQuotaError) {
      console.warn(`AI Quota exceeded for model ${PRIMARY_MODEL}. Retrying with fallback model ${FALLBACK_MODEL}...`);
      
      try {
        // Attempt with Fallback Model
        const result = await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents,
          config,
        });

        return {
          text: result.text || "",
          modelUsed: FALLBACK_MODEL,
          isFallback: true
        };
      } catch (fallbackError: any) {
        console.error("AI Fallback failed:", fallbackError);
        throw fallbackError;
      }
    }

    // Rethrow if it's not a quota error
    throw error;
  }
}
