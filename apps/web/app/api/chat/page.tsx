"use client";
import { useState } from "react";

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const ask = async () => {
    const res = await fetch("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    setAnswer(data.answer);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">💬 Ask About User Feedback</h1>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Why are users dropping off?"
        className="border p-2 w-full rounded mb-2"
      />
      <button onClick={ask} className="bg-black text-white px-4 py-2 rounded">Ask</button>
      {answer && <pre className="mt-4 bg-gray-100 p-4 rounded whitespace-pre-wrap">{answer}</pre>}
    </div>
  );
}
