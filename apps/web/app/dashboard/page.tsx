"use client";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [summary, setSummary] = useState("");

  useEffect(() => {
    fetch("/api/summarize")
      .then((res) => res.json())
      .then((data) => setSummary(data.summary));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 AI Feedback Summary</h1>
      <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">{summary}</pre>
    </div>
  );
}
