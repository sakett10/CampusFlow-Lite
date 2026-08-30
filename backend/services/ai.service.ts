import { GoogleGenAI } from '@google/genai';

type AnalysisResult = {
  title: string | null;
  type: string | null;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  registrationDeadline: string | null;
  venue: string | null;
  eligibility: string | null;
  organizer: string | null;
  importantActions: string[];
};

const analysisSchema = {
  type: "object",
  properties: {
    title: { type: "string", nullable: true },
    type: { type: "string", nullable: true },
    description: { type: "string" },
    date: { type: "string", nullable: true },
    startTime: { type: "string", nullable: true },
    endTime: { type: "string", nullable: true },
    registrationDeadline: { type: "string", nullable: true },
    venue: { type: "string", nullable: true },
    eligibility: { type: "string", nullable: true },
    organizer: { type: "string", nullable: true },
    importantActions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "title",
    "type",
    "description",
    "date",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
    "eligibility",
    "organizer",
    "importantActions"
  ],
  additionalProperties: false
};

const prompt = (text: string) => `
Analyze the following campus notice and extract structured information.

STRICT RULES:

1. DESCRIPTION
- Create a concise description when meaningful information exists.
- Use only information from the notice.
- Never invent facts.

2. EVENT DATE
- Extract the event date only.
- Remove event times from the date.
- Recognize:
  DD.MM.YYYY
  DD/MM/YYYY
  DD-MM-YYYY
  September 25, 2026
  25 September 2026
- Use Indian campus convention for ambiguous numeric dates: DD/MM/YYYY.
- Return dates as "25 September 2026".

3. EVENT TIME
- Extract event times.
- Recognize 2 PM, 2:00 PM, 14:00, 2 PM to 5 PM, etc.
- Return times as HH:mm.
- If there is a range, use startTime and endTime.
- If only one time exists, endTime is null.
- Never invent times.

4. REGISTRATION DEADLINE
- Extract the complete registration deadline.
- Include the year whenever it can be determined.
- Return dates as "25 September 2026".
- If the year genuinely cannot be determined, return null.

5. TYPE
Choose exactly one:
HACKATHON
WORKSHOP
EVENT
ANNOUNCEMENT
DEADLINE

If unsure, use ANNOUNCEMENT.

6. IMPORTANT ACTIONS
Extract actions such as:
- Register online
- Fill a form
- Pay a fee
- Form a team
- Submit an application

If there are no actions, return [].

7. OTHER INFORMATION
Extract title, venue, eligibility, organizer and other fields only when supported by the notice.

8. HALLUCINATION
If information is not present and cannot be safely inferred, return null.

Return ONLY valid JSON matching the requested schema.

NOTICE:

"""
${text}
"""
`;

async function analyzeWithGemini(text: string): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt(text),
    config: {
      responseMimeType: 'application/json',
      responseSchema: analysisSchema
    }
  });

  if (!response.text) {
    throw new Error('No response from Gemini');
  }

  return JSON.parse(response.text);
}

async function analyzeWithGroq(text: string): Promise<AnalysisResult> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: 'You extract structured information from campus notices. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt(text)
          }
        ],
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'campus_notice',
            strict: true,
            schema: analysisSchema
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response from Groq');
  }

  return JSON.parse(content);
}

export const aiService = {
  analyzeNotice: async (text: string): Promise<AnalysisResult> => {
    if (!text || text.trim() === '') {
      throw new Error('Text is required');
    }

    try {
      return await analyzeWithGemini(text);
    } catch (geminiError) {
      console.error('Gemini failed, attempting Groq fallback:', geminiError);

      try {
        return await analyzeWithGroq(text);
      } catch (groqError) {
        console.error('Groq fallback also failed:', groqError);

        throw new Error(
          'Both AI providers are currently unavailable. Please try again later.',
          { cause: groqError }
        );
      }
    }
  }
};