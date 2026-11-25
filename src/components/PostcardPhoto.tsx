import type { PostcardPhoto as Photo } from "../../shared/postcards";
import "./Postcard.css";

interface PostcardPhotoProps {
  photo: Photo;
  /** Below the fold (the log): load it when it's near the screen. */
  lazy?: boolean;
  /** Hide the credit where the postcard is a small thumbnail (the log links the milestone page, which credits it). */
  credit?: boolean;
}

/**
 * A postcard's real NASA photo (prompts 95-97), filling the postcard's photo area, with its credit line on it. Photos
 * are drawn smoothly, not pixelated: they're scaled down from twice their size and aren't pixel art.
 */
export function PostcardPhoto({ photo, lazy = false, credit = true }: PostcardPhotoProps) {
  return (
    <>
      <img className="postcard__img" src={photo.image} alt={photo.alt} width={596} height={368} loading={lazy ? "lazy" : undefined} decoding="async" />
      {credit && <span className="postcard__credit">{photo.credit}</span>}
    </>
  );
}
