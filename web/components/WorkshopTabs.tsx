import Link from "next/link";
import { WORKSHOPS } from "@/lib/workshops";

export default function WorkshopTabs({ active }: { active: string }) {
  return (
    <div className="topbar">
      <div className="wrap topbar-inner">
        <div className="brand">
          Logica y Representacion III <span>· workshops</span>
        </div>
        <nav className="tabs">
          {WORKSHOPS.map((w) => (
            <Link
              key={w.slug}
              href={`/w/${w.slug}/`}
              className={[
                "tab",
                w.slug === active ? "active" : "",
                w.status === "planned" ? "planned" : "",
              ].join(" ")}
            >
              Workshop {w.n}
              {w.status === "planned" ? " ·" : ""}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
