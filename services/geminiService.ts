
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getDiaryReflection(content: string) {
  if (!content.trim()) return "일기를 작성하면 AI가 따뜻한 한마디를 남겨드려요.";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `다음은 사용자가 쓴 일기입니다. 이 일기를 읽고 따뜻한 위로나 응원의 메시지, 혹은 가이버운 코멘트를 한 문장으로 한국어로 작성해주세요: "${content}"`,
      config: {
        temperature: 0.7,
        // Removed maxOutputTokens to avoid blocking output due to default thinking tokens in Gemini 3 models
      }
    });
    // response.text is a property, not a method
    return response.text || "오늘 하루도 고생 많으셨어요.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "항상 당신의 오늘을 응원합니다.";
  }
}
