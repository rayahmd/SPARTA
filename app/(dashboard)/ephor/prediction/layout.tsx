import { redirect } from "next/navigation";
import { SHOW_PREDICTION_UI } from "@/lib/config/features";

// Selama UI Prediction disembunyikan, halaman ini dialihkan ke dashboard.
// Halaman dan kodenya tetap ada; aktifkan lagi lewat lib/config/features.ts.
export default function PredictionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!SHOW_PREDICTION_UI) redirect("/ephor");
  return children;
}
