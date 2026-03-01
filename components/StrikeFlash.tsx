"use client";

import { useEffect, useState } from "react";

interface StrikeFlashProps {
  active: boolean;
}

export default function StrikeFlash({ active }: StrikeFlashProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <div className="strike-flash fixed inset-0 z-[100] pointer-events-none" />
  );
}
