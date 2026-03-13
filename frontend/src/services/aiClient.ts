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
    throw new Error("AI capabilities are offline. Please configure VITE_GEMINI_API_KEY. [v2]");
  }

  const { prompt, parts, config } = options;
  const contents = parts ? [{ role: "user", parts }] : [{ role: "user", parts: [{ text: prompt || "" }] }];

  const attempts = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError: any = null;

  for (const modelName of attempts) {
    try {
      const result = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });
      return { 
        text: result.text || "", 
        modelUsed: modelName, 
        isFallback: modelName !== attempts[0] 
      };
    } catch (err: any) {
      lastError = err;
      if (!isRetryableError(err)) break;
      console.warn(`AI Model ${modelName} failed/throttled. Trying next...`);
    }
  }

  const errorMsg = lastError?.message || "AI system overloaded";
  throw new Error(`${errorMsg} (All models exhausted) [v2]`);
}

function isRetryableError(error: any): boolean {
  if (!error) return false;

  const msg = String(error.message || "").toLowerCase();
  const status = error.status; 
  const statusStr = typeof status === 'string' ? status.toUpperCase() : String(status || "");
  
  return (
    msg.includes("429") || 
    msg.includes("404") || 
    msg.includes("quota") || 
    msg.includes("not found") ||
    statusStr === "RESOURCE_EXHAUSTED" ||
    statusStr === "NOT_FOUND" ||
    statusStr === "UNAVAILABLE" ||
    status === 429 ||
    status === 404
  );
}
