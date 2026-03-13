import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Using verified model aliases from the v1beta models list
export const PRIMARY_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
export const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-1.5-flash" // Some regions might still use this
];

export interface AIResponse {
  text: string;
  modelUsed: string;
  isFallback: boolean;
}

/**
 * Executes a generative AI request with a multi-tier fallback system.
 * Handles both 429 (Quota) and 404 (Missing Model) errors automatically.
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

  // 1. Attempt Primary Model
  try {
    const result = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents,
      config,
    });
    return { text: result.text || "", modelUsed: PRIMARY_MODEL, isFallback: false };
  } catch (error: any) {
    if (!isRetryableError(error)) throw error;
    console.warn(`AI Primary Model (${PRIMARY_MODEL}) failed. Error: ${error.status || error.message}. Retrying with fallbacks...`);
  }

  // 2. Attempt Fallbacks in sequence
  for (const modelName of FALLBACK_MODELS) {
    if (modelName === PRIMARY_MODEL) continue;
    
    try {
      const result = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });
      console.info(`Success with fallback model: ${modelName}`);
      return { text: result.text || "", modelUsed: modelName, isFallback: true };
    } catch (fallbackError: any) {
      if (!isRetryableError(fallbackError)) {
        console.error(`Fallback model ${modelName} failed with non-retryable error:`, fallbackError);
      } else {
        console.warn(`Fallback model ${modelName} failed/throttled. Trying next...`);
      }
    }
  }

  throw new Error("AI system is currently overloaded across all available models. Please try again in 60s.");
}

function isRetryableError(error: any): boolean {
  const msg = (error?.message || "").toLowerCase();
  const status = (error?.status || "").toUpperCase();
  
  // 429 (Quota), 404 (Not Found - often means model ID changed), 503 (Unavailable)
  return (
    msg.includes("429") || 
    msg.includes("404") || 
    msg.includes("quota") || 
    msg.includes("not found") ||
    status === "RESOURCE_EXHAUSTED" ||
    status === "NOT_FOUND" ||
    status === "UNAVAILABLE"
  );
}
