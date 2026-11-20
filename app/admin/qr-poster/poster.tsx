"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { joinUrl } from "@/lib/site";

export function Poster({ baseUrl, src, churchName, logoUrl }: { baseUrl: string; src: string; churchName: string; logoUrl: string | null }) {
  const url = joinUrl(baseUrl, src);
  const [svg, setSvg] = useState("");
  const [heading, setHeading] = useState("Welcome! Let's stay in touch");
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "H" }).then(setSvg);
  }, [url]);

  return (
    <div className="flex flex-1 flex-col items-center bg-white text-black">
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: white; } }`}</style>
      <div className="flex w-full max-w-[210mm] flex-wrap items-center gap-2 p-4 print:hidden">
        <input
          className="min-w-64 flex-1 rounded border px-2 py-1"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          aria-label="Poster heading"
        />
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <div className="flex h-[297mm] w-[210mm] flex-col items-center justify-center gap-[8mm] border p-[15mm] text-center print:border-0">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external logo from settings
          <img src={logoUrl} alt="" className="h-[30mm] w-[30mm] object-contain" />
        )}
        <div className="text-[13mm] font-bold leading-tight">{churchName}</div>
        <div className="text-[9mm] leading-tight">{heading}</div>
        <div className="w-[120mm] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-[7mm] font-semibold">Scan with your phone camera to register</div>
        <div className="text-[5mm] text-neutral-600">or visit {url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>
  );
}
