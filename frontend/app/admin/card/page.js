"use client";

import CardEditor from "@/components/admin/CardEditor";
import { useAdmin } from "../adminContext";

export default function CardPage() {
  const { segments, coupons, settings, saveWheel, savingWheel, savedWheel } = useAdmin();
  return (
    <CardEditor
      segments={segments}
      coupons={coupons}
      wheelSize={settings.wheelSize}
      maxSpinsPer={settings.maxSpinsPer}
      onSave={saveWheel}
      saving={savingWheel}
      saved={savedWheel}
    />
  );
}
