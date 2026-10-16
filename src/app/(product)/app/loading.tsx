import { LastroMark } from "@/components/shared/brand/LastroMark";

/**
 * Shown at once when a page of the app is opened and its answer is not in the browser yet:
 * the navigation stays and the content area answers the tap immediately.
 */
export default function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" aria-busy="true" aria-label="Carregando">
      <LastroMark size={40} loading />
    </div>
  );
}
