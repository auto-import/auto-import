import { Suspense } from "react";
import DossierCreateWorkspace from "@/components/commerce/DossierWizardWorkspace";

export default function DossierCreatePage() {
  return (
    <Suspense fallback={null}>
      <DossierCreateWorkspace />
    </Suspense>
  );
}
