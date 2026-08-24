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
- Explicitly recognize common campus notice date formats including: 25.9.2026, 25.09.2026, 25/09/2026, 25-09-2026, September 25, 2026, 25 September 2026.
- Interpret ambiguous numeric dates using Indian campus convention: DD.MM.YYYY or DD/MM/YYYY, not MM/DD/YYYY.
- Normalize extracted event dates into a consistent human-readable format: "25 September 2026".
- Example:
  "September 5, 2026 from 2 PM to 5 PM"
  must become:
  "5 September 2026"

3. EVENT TIME
- Extract event times from the notice.
- Recognize formats like: 2 PM, 2:00 PM, 14:00, 2 PM to 5 PM, 2:00 PM - 5:00 PM, 14:00-17:00, 09:00 to 16:30.
- Normalize times to 24-hour HH:mm format (e.g. 2 PM -> "14:00", 2:30 PM -> "14:30", 5 PM -> "17:00", 09:00 -> "09:00").
- If there is a time range, set startTime to the beginning and endTime to the ending.
- If there is only one event time, set startTime to that time and endTime to null.
- If there is no event time, set both to null.
- NEVER invent a time.

4. REGISTRATION DEADLINE
- Extract the complete registration deadline.
- Apply the same date formatting and parsing rules as EVENT DATE.
- Normalize into a consistent human-readable format: "25 September 2026".
- Always include the year when it can be determined from the notice.
- If the notice says "before September 3" and the event date is in 2026, return:
  "3 September 2026"
- If the year genuinely cannot be determined, return null rather than guessing.

5. TYPE
Choose exactly one of:
HACKATHON, WORKSHOP, EVENT, ANNOUNCEMENT, DEADLINE

If unsure, choose ANNOUNCEMENT.

6. IMPORTANT ACTIONS
List the key steps the user must take, such as:
- Fill Google Form
- Register online
- Pay fee
- Form a team

If there are no actions, return [].

7. OTHER INFORMATION
Extract venue, eligibility, organizer, title, and other fields only from information supported by the notice.

8. HALLUCINATION
If information is genuinely not present and cannot be safely inferred, return null.
Do NOT invent dates, times, venues, eligibility, organizers, deadlines, or other facts.

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
              startTime: { type: "STRING", nullable: true },
              endTime: { type: "STRING", nullable: true },
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
