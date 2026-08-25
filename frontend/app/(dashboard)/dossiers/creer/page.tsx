import { Suspense } from "react";
import DossierCreateWorkspace from "@/components/commerce/DossierCreateWorkspace";

export default function DossierCreatePage() {
  return (
    <Suspense fallback={null}>
      <DossierCreateWorkspace />
    </Suspense>
  );
}
