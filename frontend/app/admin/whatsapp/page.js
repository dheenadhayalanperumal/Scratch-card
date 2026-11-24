"use client";

import WhatsApp from "@/components/admin/WhatsApp";
import { useAdmin } from "../adminContext";

export default function WhatsAppPage() {
  const { settings, patchSettings, saveWhatsApp, savingWa, savedWa } = useAdmin();
  return (
    <WhatsApp
      settings={settings}
      onChange={patchSettings}
      onSave={saveWhatsApp}
      saving={savingWa}
      saved={savedWa}
    />
  );
}
