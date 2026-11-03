import { useEffect, useRef, useState } from "react";
import { ImagePlus, Scissors } from "lucide-react";

type FlagShape = "classic" | "wide" | "square";

const SHAPES: Record<FlagShape, { label: string; ratio: number }> = {
  classic: { label: "Klasyczna · 3:2", ratio: 1.5 },
  wide: { label: "Wydłużona · 2:1", ratio: 2 },
  square: { label: "Kwadrat · 1:1", ratio: 1 },
};

export function FlagImagePicker({
  onChange,
  maxSize = 2 * 1024 * 1024,
}: {
  onChange: (file: File | null, preview: string | null) => void;
  maxSize?: number;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [shape, setShape] = useState<FlagShape>("classic");
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [sourceName, setSourceName] = useState("flaga");

  useEffect(() => {
    if (!source || !imageRef.current) return;
    const image = imageRef.current;
    const render = () => {
      const { ratio } = SHAPES[shape];
      const canvas = document.createElement("canvas");
      const width = 1200;
      const height = Math.round(width / ratio);
      canvas.width = width;
      canvas.height = height;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const overflowX = drawWidth - width;
      const overflowY = drawHeight - height;
      const x = -(overflowX * positionX / 100);
      const y = -(overflowY * positionY / 100);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, x, y, drawWidth, drawHeight);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], sourceName.replace(/\.[^.]+$/, "") + "-flag.png", { type: "image/png" });
        const preview = URL.createObjectURL(blob);
        onChangeRef.current(file, preview);
      }, "image/png", 0.92);
    };
    if (image.complete) render();
    else image.onload = render;
  }, [source, shape, zoom, positionX, positionY, sourceName]);

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-dashed border-border bg-secondary/30 px-3 py-3 text-sm transition-colors hover:border-primary/50 hover:bg-secondary/50">
        <ImagePlus className="size-4 text-primary" />
        <span>{source ? "Zmień zdjęcie flagi" : "Wybierz zdjęcie flagi"}</span>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > maxSize) {
              setError(`Plik może mieć maksymalnie ${Math.round(maxSize / 1024 / 1024)} MB`);
              event.target.value = "";
              return;
            }
            setError("");
            setSourceName(file.name);
            setZoom(1);
            setPositionX(50);
            setPositionY(50);
            setSource(URL.createObjectURL(file));
          }}
        />
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {source ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(SHAPES) as [FlagShape, typeof SHAPES[FlagShape]][]).map(([key, item]) => (
              <button key={key} type="button" onClick={() => setShape(key)} className={`border px-2 py-2 text-xs transition-colors ${shape === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/50"}`}>
                <span className={`mx-auto mb-1 block border ${shape === key ? "border-primary" : "border-current"} ${key === "square" ? "size-5" : key === "wide" ? "h-3 w-6" : "h-4 w-6"}`} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden border border-border bg-secondary/30 p-2">
            <div className="mx-auto overflow-hidden bg-background" style={{ aspectRatio: String(SHAPES[shape].ratio), maxWidth: "100%" }}>
              <img ref={imageRef} src={source} alt="Podgląd przycinania flagi" className="h-full w-full opacity-0" />
              <div className="relative -mt-full overflow-hidden" style={{ aspectRatio: String(SHAPES[shape].ratio) }}>
                <img src={source} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${positionX}% ${positionY}%`, transform: `scale(${zoom})` }} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Scissors className="size-3.5" /> Podgląd przycięcia</div>
          </div>
          <label className="block text-xs text-muted-foreground">Powiększenie <span className="float-right text-foreground">{zoom.toFixed(1)}×</span>
            <input className="mt-1 w-full accent-[var(--color-primary)]" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Poziomo
              <input className="mt-1 w-full accent-[var(--color-primary)]" type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} />
            </label>
            <label className="text-xs text-muted-foreground">Pionowo
              <input className="mt-1 w-full accent-[var(--color-primary)]" type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} />
            </label>
          </div>
        </>
      ) : <p className="text-xs text-muted-foreground">PNG, JPG lub WebP. Wybierz kształt, ustaw kadr i zapisz gotową flagę.</p>}
    </div>
  );
}
