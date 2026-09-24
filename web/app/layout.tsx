import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workshops · Logica y Representacion III",
  description:
    "Dashboard interactivo de los workshops: el pipeline de Python corre en el navegador sobre Pyodide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
