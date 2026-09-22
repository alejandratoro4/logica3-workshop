"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** La raiz solo redirige al primer workshop listo. Se hace en cliente porque
 *  la app se exporta como sitio estatico (no hay redirects de servidor). */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/w/1/");
  }, [router]);

  return (
    <div className="wrap" style={{ padding: "80px 20px" }}>
      <p className="muted">
        <span className="spinner" /> Abriendo el Workshop 1...
      </p>
    </div>
  );
}
