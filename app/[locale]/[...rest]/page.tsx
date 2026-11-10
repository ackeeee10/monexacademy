import { notFound } from "next/navigation";

// Unknown paths under a valid locale render the localized 404 page.
export default function CatchAll() {
  notFound();
}
