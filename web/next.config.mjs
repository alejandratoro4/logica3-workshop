/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estatico: la app no necesita servidor. Todo el computo ocurre en el
  // navegador, dentro de Pyodide. No hay backend ni variables de entorno.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
