"use client";
import { useEffect } from "react";

type Props = { id: string; title: string };

// Writes the most recent verdict id + title to localStorage so the home page
// can render a "last time, what happened?" banner on next visit.
export default function LastBeatdownCookie({ id, title }: Props) {
  useEffect(() => {
    try {
      localStorage.setItem(
        "cb_last_verdict",
        JSON.stringify({ id, title, t: Date.now() })
      );
    } catch {
      // storage blocked, silently drop
    }
  }, [id, title]);
  return null;
}
