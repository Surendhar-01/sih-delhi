import { generateWithFallback } from "./aiClient";

export async function chatWithAegis(
  systemContext: string,
  userMessage: string,
) {
  try {
    const prompt = `
      ROLE: AEGIS Command Assistant. Tactical operational focus.
      
      SYSTEM STATUS:
      ${systemContext}
      
      USER: "${userMessage}"
      
      GOAL: Concise, direct, professional response. Prioritize safety.
    `;

    const response = await generateWithFallback({ prompt });
    
    let resultText = response.text;
    if (response.isFallback) {
      console.info("Using AI Fallback Model for chat.");
    }
    
    return (
      resultText ||
      "Communication link unstable. Please try again."
    );
  } catch (error: any) {
    console.error("AI Error:", error);
    return `AI System Error: ${error.message || "Connection failed"}. Please try again in 60s.`;
  }
}
