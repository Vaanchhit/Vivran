const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function parseTeacherIntent(prompt: string, subject?: string, grade?: string) {
  const res = await fetch(`${API_BASE_URL}/workflow/parse-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacher_prompt: prompt, subject, grade }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.statusText}`);
  }
  return res.json();
}

export async function generateAssessmentPaper(grade: string, subject: string, topics: string[], totalMarks: number = 40) {
  const res = await fetch(`${API_BASE_URL}/assessments/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade, subject, topics, total_marks: totalMarks }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.statusText}`);
  }
  return res.json();
}

export async function regenerateQuestion(questionId: string, option: string) {
  const res = await fetch(`${API_BASE_URL}/questions/${questionId}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.statusText}`);
  }
  return res.json();
}

