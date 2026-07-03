"use client";
import { useState } from "react";
import MarkerButton from "./MarkerButton";

type Props = { id: string; verdict: string; price: number; url: string };

export default function BeatdownActions({ id, verdict, url }: Props) {
  const [detained, setDetained] = useState(false);
  const [saving, setSaving] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${location.origin}/b/${id}` : `/b/${id}`;
  const cardUrl = `/b/${id}/opengraph-image`;

  async function share() {
    const payload = {
      title: "CartBully verdict",
      text: "The bully has spoken.",
      url: shareUrl,
    };
    // Web Share API on mobile
    if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share(payload);
        return;
      } catch {
        /* fall through */
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied.");
    }
  }

  async function detain() {
    setSaving(true);
    try {
      await fetch("/api/detention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDetained(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <MarkerButton variant="secondary" onClick={share}>
        Share the beatdown
      </MarkerButton>
      <MarkerButton variant="secondary" as="a" href={cardUrl} target="_blank" rel="noopener">
        Save the card
      </MarkerButton>
      {verdict === "SPARED" ? (
        <>
          <MarkerButton variant="spared" as="a" href={url} target="_blank" rel="noopener nofollow">
            Buy it, nerd
          </MarkerButton>
          <MarkerButton variant="secondary" onClick={detain} disabled={saving || detained}>
            {detained ? "Detention set" : "Wait anyway"}
          </MarkerButton>
        </>
      ) : (
        <MarkerButton variant="secondary" onClick={detain} disabled={saving || detained}>
          {detained ? "In detention" : "Detention (48h)"}
        </MarkerButton>
      )}
    </div>
  );
}
