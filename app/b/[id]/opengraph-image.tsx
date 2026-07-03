import { ImageResponse } from "next/og";
import { getVerdictById } from "@/lib/store";
import { SHARE_FOOTER } from "@/config";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "CartBully beatdown";

export default async function OgImage({ params }: { params: { id: string } }) {
  const v = await getVerdictById(params.id);
  const verdict = v?.verdict || "TRASHED";
  const title = v?.title || "Something you were about to buy";
  const price = Number(v?.price ?? 0);
  const roast = v?.roast || "The bully was speechless. That never happens.";
  const isTrashed = verdict === "TRASHED";
  const scrawlColor = isTrashed ? "#D6231F" : "#2E7D46";

  const num = v ? Math.abs(hashString(v.id)) % 999 : 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FDFBF2",
          padding: "50px 70px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 110,
            width: 3,
            background: "#E8A9A9",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, letterSpacing: 4, color: "#6D675C" }}>
              OFFICIAL BEATDOWN
            </div>
            <div style={{ fontSize: 38, color: "#1C1A17" }}>
              {"No " + String(num).padStart(3, "0")}
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ fontSize: 44, color: "#1C1A17" }}>CART</div>
            <div style={{ fontSize: 44, color: "#D6231F" }}>BULLY</div>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 36, color: "#1C1A17", lineHeight: 1.15 }}>
              {truncate(title, 90)}
            </div>
            <div style={{ display: "flex", marginTop: 18, alignItems: "center" }}>
              {isTrashed ? (
                <div
                  style={{
                    display: "flex",
                    position: "relative",
                    fontSize: 44,
                    color: "#6D675C",
                  }}
                >
                  <span>{`$${price.toFixed(2)}`}</span>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "55%",
                      height: 5,
                      background: "#D6231F",
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 44, color: "#1C1A17" }}>
                  {`$${price.toFixed(2)}`}
                </div>
              )}
              {isTrashed && (
                <div style={{ fontSize: 24, color: "#1C1A17", marginLeft: 24 }}>
                  still in my pocket
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 20,
            transform: "rotate(-4deg)",
          }}
        >
          <div style={{ fontSize: 140, color: scrawlColor, letterSpacing: 4 }}>
            {verdict}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 20,
            padding: "18px 24px",
            borderLeft: "6px solid #D6231F",
            fontSize: 28,
            color: "#1C1A17",
            fontStyle: "italic",
          }}
        >
          {`"${truncate(roast, 180)}"`}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
          }}
        >
          <div style={{ fontSize: 22, color: "#6D675C" }}>cartbully.com</div>
          <div style={{ fontSize: 22, color: "#6D675C" }}>{SHARE_FOOTER}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
