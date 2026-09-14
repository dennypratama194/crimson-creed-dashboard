"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemThumb } from "@/components/patterns/item-thumb";

const BUCKET = "item-images";
const MAX_BYTES = 2 * 1024 * 1024;
// The object key's extension comes from the validated MIME type, never the
// user-supplied filename. The bucket enforces the same type + size list.
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ACCEPTED = Object.keys(EXTENSION_BY_TYPE);

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
    const ext = EXTENSION_BY_TYPE[file.type];
    if (!ext) {
      setError("Use a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setUrl(data.publicUrl);
      toast.success("Image uploaded.");
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
            PNG, JPEG, WebP or GIF, up to 2 MB.
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
