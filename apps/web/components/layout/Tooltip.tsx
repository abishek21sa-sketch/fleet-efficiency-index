"use client";

import { useEffect, useRef } from "react";
import { mountTooltip } from "@/lib/chart-utils";

export default function Tooltip() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountTooltip(ref.current);
    return () => mountTooltip(null);
  }, []);

  return <div className="tooltip" ref={ref} />;
}
