/* eslint-disable @next/next/no-img-element */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ThumbnailProps {
  url: string | null | undefined;
}

export function Thumbnail({ url }: ThumbnailProps) {
  if (!url) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="relative overflow-hidden max-w-[360px] border rounded-lg my-2 cursor-zoom-in">
          <img
            src={url}
            alt="Message Image"
            className="rounded-md object-cover size-full"
          />
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[800px] border-none p-0 bg-transparent shadow-none">
        <img
          src={url}
          alt="Message Image"
          className="rounded-md object-cover size-full"
        />
      </DialogContent>
    </Dialog>
  );
}
