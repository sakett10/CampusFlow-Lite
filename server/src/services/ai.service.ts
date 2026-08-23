import { GoogleGenAI } from '@google/genai';

export const aiService = {
  analyzeNotice: async (text: string) => {
    if (!text || text.trim() === '') {
      throw new Error("Text is required");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("Configuration Error: GEMINI_API_KEY is not configured in the environment variables.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Analyze the following campus notice and extract structured information.

STRICT EXTRACTION RULES:

1. DESCRIPTION
- Always create a concise description when the notice contains meaningful information.
- The description should summarize the main purpose of the event or announcement using only information from the notice.
- Do NOT return null for description when the notice contains enough information to summarize.
- Do NOT invent facts that are not present in the notice.

2. EVENT DATE
- Extract the event date only.
- Remove any time or time range from the event date.
- Example:
  "September 5, 2026 from 2 PM to 5 PM"
  must become:
  "September 5, 2026"

3. REGISTRATION DEADLINE
- Extract the complete registration deadline.
- Always include the year when it can be determined from the notice.
- If the notice says "before September 3" and the event date is in 2026, return:
  "September 3, 2026"
- If the year genuinely cannot be determined, return null rather than guessing.

4. TYPE
Choose exactly one of:
HACKATHON, WORKSHOP, EVENT, ANNOUNCEMENT, DEADLINE

If unsure, choose ANNOUNCEMENT.

5. IMPORTANT ACTIONS
List the key steps the user must take, such as:
- Fill Google Form
- Register online
- Pay fee
- Form a team

If there are no actions, return [].

6. OTHER INFORMATION
Extract venue, eligibility, organizer, title, and other fields only from information supported by the notice.

7. HALLUCINATION
If information is genuinely not present and cannot be safely inferred, return null.
Do NOT invent dates, venues, eligibility, organizers, deadlines, or other facts.

Return ONLY valid JSON matching the provided response schema.

Notice Text:

"""
${text}
"""
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", nullable: true },
              type: { type: "STRING", nullable: true },
              description: { type: "STRING" },
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
      throw error;
    }
  }
};
