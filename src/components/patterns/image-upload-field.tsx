"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { toast } from "@/lib/toast";
import { uploadItemImageAction } from "@/app/(app)/admin/items/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemThumb } from "@/components/patterns/item-thumb";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function ImageUploadField({
  name = "imageUrl",
  defaultUrl = "",
  label = "Thumbnail",
}: {
  name?: string;
  defaultUrl?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const result = await uploadItemImageAction(formData);
      if (!result.ok) throw new Error(result.error);

      setUrl(result.url);
      toast.success("Image converted to WebP and uploaded.");
    } catch {
      const message = "Upload failed. Try again, or paste an image URL below.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        {label}{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </span>

      <input type="hidden" name={name} value={url} />

      <div className="flex items-center gap-3">
        <ItemThumb src={url || null} name="Item preview" size="lg" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {url ? "Replace" : "Upload"}
            </Button>
            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setUrl("");
                  setError(null);
                }}
              >
                <X className="size-4" />
                Remove
              </Button>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            PNG, JPEG, WebP or GIF, up to 2 MB. Saved as WebP, max 256px.
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="…or paste an image URL"
        aria-label="Image URL"
      />

      {error ? <p className="text-xs text-tone-error-fg">{error}</p> : null}
    </div>
  );
}
