export default function Scene() {
  return (
    <svg
      className="scene"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="sky">
          <stop stopColor="#6a424e" />
          <stop offset=".5" stopColor="#26202d" />
          <stop offset="1" stopColor="#101218" />
        </radialGradient>
        <radialGradient id="moon">
          <stop stopColor="#ffe2a9" />
          <stop offset="1" stopColor="#cc9365" />
        </radialGradient>
        <linearGradient id="mist" x2="0" y2="1">
          <stop stopColor="#c28b57" stopOpacity="0" />
          <stop offset="1" stopColor="#c28b57" stopOpacity=".18" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width="1200" height="700" fill="url(#sky)" />
      <circle
        cx="817"
        cy="140"
        r="91"
        fill="#e8b179"
        opacity=".12"
        filter="url(#glow)"
      />
      <circle cx="817" cy="140" r="59" fill="url(#moon)" />
      <g fill="#a77856" opacity=".22">
        <ellipse cx="799" cy="117" rx="13" ry="18" />
        <ellipse cx="839" cy="159" rx="19" ry="11" />
        <circle cx="828" cy="109" r="9" />
      </g>
      <g fill="#111217">
        <path d="M0 540 98 467 220 507 354 440 478 489 594 425 760 478 963 405 1200 485V700H0Z" />
        <path d="M141 520V339h155v181M128 345l90-101 91 101M203 275V200l15-63 16 63v75M420 505V351h144v154M400 356l92-124 94 124M665 484V282h99v202M646 291l68-165 70 165M706 146V84l9-77 10 77v62M898 469V338h157v131M879 340l97-121 101 121M963 244V178l13-54 14 54v66" />
      </g>
      <g fill="#e89442">
        <path d="M174 379h16v26h-16zm57 0h16v26h-16zm-27 72h25v46h-25zM451 397h16v24h-16zm57 0h16v24h-16zm-23 55h20v46h-20zM692 338h15v30h-15zm38 0h15v30h-15zM945 380h15v26h-15zm51 0h15v26h-15z" />
      </g>
      <g fill="none" stroke="#0c0e12" strokeWidth="19" strokeLinecap="round">
        <path d="M90 700 85 363 56 220 5 121M85 405 169 267 158 154M59 232 139 192 190 111M1096 700 1109 327 1173 191 1205 94M1110 386 1024 263 1010 164M1145 258 1059 209 1033 133" />
        <path
          d="M85 481 25 358M154 271 222 232M1099 492 1193 373"
          strokeWidth="9"
        />
      </g>
      <path d="M0 537h1200v163H0Z" fill="url(#mist)" />
      <path
        d="M0 651 74 629 158 655 291 616 406 640 566 598 789 646 935 601 1200 650V700H0Z"
        fill="#0b0d11"
      />
    </svg>
  );
}
