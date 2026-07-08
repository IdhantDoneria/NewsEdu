/**
 * Gemini API wrapper for NewsEdu
 * Uses @google/genai (Google AI Studio SDK)
 *
 * Get your free API key at: https://aistudio.google.com/apikey
 * Requires: GEMINI_API_KEY environment variable
 */

import { GoogleGenAI } from '@google/genai';

export async function summarizeWithGemini(prompt, model = 'gemini-2.5-flash') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Gemini API key not configured. Set GEMINI_API_KEY environment variable. ' +
      'Get your free key at: https://aistudio.google.com/apikey'
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
    });

    // Handle response - try multiple formats since SDK versions may differ
    if (response) {
      // Format 1: Direct text property (some versions)
      if (typeof response === 'string') {
        return response;
      }

      // Format 2: candidates[0].content.parts[0].text
      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.candidates[0].content.parts[0].text;
      }

      // Format 3: text property
      if (response.text) {
        return response.text;
      }

      // Format 4: Direct response might be an object with text
      if (response.text) {
        return response.text;
      }

      throw new Error(`Unexpected response format: ${JSON.stringify(response).substring(0, 100)}`);
    }

    throw new Error('Empty response from Gemini API');
  } catch (error) {
    const message = error?.message || String(error);
    throw new Error(`Gemini API error: ${message}`);
  }
}

/**
 * Generate a market summary for a specific region
 */
export async function generateMarketSummary(market, headlines) {
  const headlineText = headlines.map(h => `- ${h}`).join('\n');

  const prompt = `You are a financial analyst. Provide a brief, highly accurate 2-paragraph summary of the recent developments in the ${market} stock market based on the following news headlines. Focus on key movers, economic data, and overall sentiment.\n\nHeadlines:\n${headlineText}`;

  return summarizeWithGemini(prompt);
}
