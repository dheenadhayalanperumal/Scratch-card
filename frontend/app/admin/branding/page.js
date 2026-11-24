"use client";

import Branding from "@/components/admin/Branding";
import { useAdmin } from "../adminContext";

export default function BrandingPage() {
  const { settings, patchSettings, saveBranding, savingBrand, savedBrand, error } = useAdmin();
  return (
    <Branding
      settings={settings}
      onChange={patchSettings}
      onSave={saveBranding}
      saving={savingBrand}
      saved={savedBrand}
      saveError={error}
    />
  );
}
