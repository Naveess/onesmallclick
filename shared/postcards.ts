// The postcard photos (prompts 95-97): real NASA photos, one per milestone and one for each stop's landing.
// Content: each milestone's `postcard` and the stop's `landingPostcard` in content/milestones/<stop>.json; the images
// are public/postcards/ (scripts/make-postcards.py). Credits and licences: docs/postcard-photos.md.

import { LEG_LANDING_POSTCARDS, LEG_MILESTONES, type PostcardPhoto } from "./content";

export type { PostcardPhoto };

const BY_SLUG: Record<string, PostcardPhoto> = Object.fromEntries(
  Object.values(LEG_MILESTONES)
    .flat()
    .filter((m) => m.postcard)
    .map((m) => [m.slug, m.postcard as PostcardPhoto]),
);

/** The postcard photo for milestone `n` on the leg to `stop`. */
export function postcardOf(stop: string, n: number): PostcardPhoto | undefined {
  return LEG_MILESTONES[stop]?.find((m) => m.n === n)?.postcard;
}

/** The postcard photo for a milestone, by its slug (slugs are unique across legs). */
export function postcardBySlug(slug: string): PostcardPhoto | undefined {
  return BY_SLUG[slug];
}

/** The landing postcard's photo for `stop`. */
export function landingPostcardOf(stop: string): PostcardPhoto | undefined {
  return LEG_LANDING_POSTCARDS[stop];
}
