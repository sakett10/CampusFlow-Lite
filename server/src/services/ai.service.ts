import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

// Mock response fallback for dev/testing when key is missing or dummy
const getMockResponse = () => ({
  title: "Mock Hackathon 2026",
  type: "HACKATHON",
  description: "A placeholder hackathon event because the API key is not configured.",
  date: "2026-10-15",
  registrationDeadline: "2026-10-01",
  venue: "Main Auditorium",
  eligibility: "All students",
  organizer: "CS Club",
  importantActions: ["Register online", "Form a team"]
});

export const aiService = {
  analyzeNotice: async (text: string) => {
    if (!text || text.trim() === '') {
      throw new Error("Text is required");
    }

    if (!apiKey || apiKey === 'your_key_here') {
      console.warn("Using mock AI response because GEMINI_API_KEY is not set or dummy.");
      return getMockResponse();
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Analyze the following campus notice and extract the structured information.
If a piece of information is NOT explicitly stated, you MUST return null for that field. Do NOT hallucinate dates, venues, eligibility, organizers, or deadlines.
For 'type', choose exactly one of: HACKATHON, WORKSHOP, EVENT, ANNOUNCEMENT, DEADLINE. If unsure, choose ANNOUNCEMENT.
For 'importantActions', list any key steps the user must take (e.g., 'Fill Google Form', 'Pay fee'). If none, return [].

Notice Text:
"""
${text}
"""`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", nullable: true },
              type: { type: "STRING", nullable: true },
              description: { type: "STRING", nullable: true },
              date: { type: "STRING", nullable: true },
              registrationDeadline: { type: "STRING", nullable: true },
              venue: { type: "STRING", nullable: true },
              eligibility: { type: "STRING", nullable: true },
              organizer: { type: "STRING", nullable: true },
              importantActions: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["importantActions"]
          }
        }
      });
      
      const jsonText = response.text;
      if (!jsonText) throw new Error("No response from AI");
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      throw new Error("Failed to analyze notice", { cause: error });
    }
  }
};
