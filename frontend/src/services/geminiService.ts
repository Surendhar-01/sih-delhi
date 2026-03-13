import { Type } from "@google/genai";
import { Task } from "../types";
import { ai, generateWithFallback } from "./aiClient";

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

  const prompt = `
    Analyze drone footage situaton. Detect victims/hazards.
    
    Return JSON:
    - type: Primary emergency
    - priority: "low", "medium", "high", "critical"
    - victimCount: number
    - description: SITREP
    - keywords: status words
    - priorityScore: 0-100
    - crowdDensity: "low", "medium", "high"
    - hazards: list
    - missingPersonDetected: boolean
  `;

  const parts: any[] = [
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: base64Image } },
  ];

  if (audioTranscript) {
    parts.push({ text: `Audio: ${audioTranscript}` });
  }

  try {
    const response = await generateWithFallback({
      parts,
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

  const prompt = `
    Recent tasks: ${JSON.stringify(historicalTasks.slice(0, 5))}
    Predict spread/trend (one sentence).
  `;

  try {
    const response = await generateWithFallback({ prompt });
    return response.text || "No trend detected.";
  } catch (error) {
    console.error("Gemini trend prediction failed:", error);
    return "No trend detected.";
  }
}
