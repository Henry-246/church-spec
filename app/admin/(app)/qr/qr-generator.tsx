"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinUrl } from "@/lib/site";

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

export function QrGenerator({ baseUrl }: { baseUrl: string }) {
  const [src, setSrc] = useState("");
  const [svg, setSvg] = useState("");
  const url = joinUrl(baseUrl, src);
  const fileBase = `join-qr${src ? "-" + src.replace(/[^a-z0-9_-]+/gi, "-") : ""}`;

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" }).then(setSvg);
  }, [url]);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="grid max-w-md content-start gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="src">Where will this QR code be used? (optional)</Label>
          <Input id="src" placeholder="e.g. banner, sunday-bulletin, youth-flyer" value={src} onChange={(e) => setSrc(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Saved with each registration as &quot;source&quot;, so you can see which QR code people used (Members → filter/export).
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label>Link</Label>
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(url)}>
              Copy
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={async () => download(`${fileBase}.png`, await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M" }))}
          >
            Download PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download(`${fileBase}.svg`, URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })))}
          >
            Download SVG
          </Button>
          <Button type="button" variant="outline" nativeButton={false} render={<a href={`/admin/qr-poster?src=${encodeURIComponent(src)}`} target="_blank" />}>
            Printable A4 poster
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tip: test the code with your own phone before printing. SVG is best for large prints (banners).
        </p>
      </div>
      <div
        className="w-64 rounded-lg border bg-white p-2 sm:w-72 [&_svg]:h-auto [&_svg]:w-full"
        aria-label="QR code preview"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
