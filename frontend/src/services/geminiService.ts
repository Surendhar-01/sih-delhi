import { GoogleGenAI, Type } from "@google/genai";
import { Task } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const DEFAULT_GEMINI_MODEL =
  import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

export interface AIDetectionResult {
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  victimCount: number;
  description: string;
  keywords: string[];
  priorityScore: number;
  crowdDensity: "low" | "medium" | "high";
  hazards: string[];
  missingPersonDetected: boolean;
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const FALLBACK_DETECTION: AIDetectionResult = {
  type: "Unknown",
  priority: "medium",
  victimCount: 0,
  description: "AI analysis unavailable.",
  keywords: [],
  priorityScore: 0,
  crowdDensity: "low",
  hazards: [],
  missingPersonDetected: false,
};

function sanitizeDetectionResult(
  raw: Partial<AIDetectionResult> | null | undefined,
): AIDetectionResult {
  if (!raw) return FALLBACK_DETECTION;
  return {
    type: raw.type || FALLBACK_DETECTION.type,
    priority:
      raw.priority &&
      ["low", "medium", "high", "critical"].includes(raw.priority)
        ? raw.priority
        : FALLBACK_DETECTION.priority,
    victimCount: Number.isFinite(raw.victimCount)
      ? Math.max(0, Math.floor(raw.victimCount))
      : FALLBACK_DETECTION.victimCount,
    description: raw.description || FALLBACK_DETECTION.description,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((item): item is string => typeof item === "string")
      : [],
    priorityScore: Number.isFinite(raw.priorityScore)
      ? Math.max(0, Math.min(100, raw.priorityScore))
      : FALLBACK_DETECTION.priorityScore,
    crowdDensity:
      raw.crowdDensity && ["low", "medium", "high"].includes(raw.crowdDensity)
        ? raw.crowdDensity
        : FALLBACK_DETECTION.crowdDensity,
    hazards: Array.isArray(raw.hazards)
      ? raw.hazards.filter((item): item is string => typeof item === "string")
      : [],
    missingPersonDetected: Boolean(raw.missingPersonDetected),
  };
}

export async function analyzeDroneFeed(
  base64Image: string,
  audioTranscript?: string,
): Promise<AIDetectionResult> {
  if (!ai || !base64Image) {
    return FALLBACK_DETECTION;
  }

  const model = DEFAULT_GEMINI_MODEL;

  const prompt = `
    Act as an Advanced Disaster Response AI. Analyze this drone footage capture and optional audio transcript.
    
    TASK:
    1. Detect victims, hazards (fire, flood, structural collapse, smoke).
    2. Estimate crowd density (low, medium, high).
    3. Calculate a priority score (0-100) based on urgency, victim count, and hazard proximity.
    4. Detect emergency keywords in transcript if provided.
    5. Check for missing persons (simulated facial recognition context).
    
    Return a JSON object with:
    - type: Primary emergency type (e.g., "Flood", "Fire", "Medical", "Crowd Crush")
    - priority: "low", "medium", "high", or "critical"
    - victimCount: estimated number of people
    - description: concise situational report
    - keywords: array of emergency words detected
    - priorityScore: number 0-100
    - crowdDensity: "low", "medium", or "high"
    - hazards: array of detected hazards
    - missingPersonDetected: boolean
  `;

  const parts: GeminiContentPart[] = [
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: base64Image } },
  ];

  if (audioTranscript) {
    parts.push({ text: `Audio Transcript: ${audioTranscript}` });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            priority: {
              type: Type.STRING,
              enum: ["low", "medium", "high", "critical"],
            },
            victimCount: { type: Type.INTEGER },
            description: { type: Type.STRING },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            priorityScore: { type: Type.NUMBER },
            crowdDensity: {
              type: Type.STRING,
              enum: ["low", "medium", "high"],
            },
            hazards: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            missingPersonDetected: { type: Type.BOOLEAN },
          },
          required: [
            "type",
            "priority",
            "victimCount",
            "description",
            "keywords",
            "priorityScore",
            "crowdDensity",
            "hazards",
            "missingPersonDetected",
          ],
        },
      },
    });

    return sanitizeDetectionResult(JSON.parse(response.text || "{}"));
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return FALLBACK_DETECTION;
  }
}

export async function predictDisasterTrend(
  historicalTasks: Task[],
): Promise<string> {
  if (!ai || historicalTasks.length === 0) {
    return "No trend detected.";
  }

  const model = DEFAULT_GEMINI_MODEL;
  const prompt = `
    Based on these recent rescue tasks: ${JSON.stringify(historicalTasks.slice(0, 5))}
    Predict the potential spread or trend of the disaster (e.g., "Flood moving South-East", "Fire spreading to residential zone").
    Provide a one-sentence prediction.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return response.text || "No trend detected.";
  } catch (error) {
    console.error("Gemini trend prediction failed:", error);
    return "No trend detected.";
  }
}
