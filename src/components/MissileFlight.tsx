import { useId } from "react";

/** One coordinate system keeps the projectile, exhaust and target aligned. */
export function MissileFlight({ heavy, intercepted }: { heavy: boolean; intercepted: boolean }) {
  const id = useId().replace(/:/g, "");
  const pathId = `trajectory-${id}`;
  const duration = heavy ? "4.8s" : "3.6s";
  return (
    <div className={`missile-flight ${heavy ? "missile-flight-heavy" : ""} ${intercepted ? "missile-flight-intercepted" : ""}`}>
      <svg viewBox="0 0 600 260" role="img" aria-label={intercepted ? "Lot rakiety do strefy obrony OPL" : "Lot rakiety do wybranego celu"}>
        <defs>
          <path id={pathId} d="M 60 204 C 190 52 356 52 520 172" />
        </defs>
        <path className="missile-flight-ground" d="M 24 220 H 576" />
        <use href={`#${pathId}`} className="missile-flight-guide" />
        <use href={`#${pathId}`} className="missile-flight-trace" pathLength="1">
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur={duration} fill="freeze" />
        </use>
        <g className="missile-flight-marker" transform="translate(60 204)">
          <circle r="8" /><path d="M -14 0 H 14 M 0 -14 V 14" />
        </g>
        <g className="missile-flight-marker missile-flight-destination" transform="translate(520 172)">
          <circle r="17" /><circle r="6" /><path d="M -26 0 H -12 M 12 0 H 26 M 0 -26 V -12 M 0 12 V 26" />
        </g>
        <g className="missile-flight-projectile">
          <animateMotion dur={duration} rotate="auto" fill="freeze"><mpath href={`#${pathId}`} /></animateMotion>
          <g transform={heavy ? "scale(1.25)" : "scale(1)"}>
            <path className="missile-flight-exhaust" d="M -17 -4 L -48 0 L -17 4 Z" />
            <path className="missile-flight-body" d="M 20 0 Q 8 -9 -13 -6 L -19 -12 L -20 -3 L -16 0 L -20 3 L -19 12 L -13 6 Q 8 9 20 0 Z" />
            <path className="missile-flight-window" d="M 4 -4 L 4 4" />
          </g>
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.94;1" dur={duration} fill="freeze" />
        </g>
        <g className="missile-flight-arrival" transform="translate(520 172)" opacity="0">
          <circle className="missile-flight-impact" r="8">
            <animate attributeName="r" from="8" to={heavy ? "72" : "40"} begin={duration} dur="0.6s" fill="freeze" />
          </circle>
          <animate attributeName="opacity" values="0;1;0" begin={duration} dur="0.6s" fill="freeze" />
        </g>
        <text x="60" y="244" textAnchor="middle">START</text>
        <text x="520" y="220" textAnchor="middle">{intercepted ? "OBRONA OPL" : "CEL"}</text>
      </svg>
    </div>
  );
}