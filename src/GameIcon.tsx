/** Small, local game glyphs: consistent ink outline, no font-dependent emoji. */
export function GameIcon({ kind, className = '' }: {
    kind: string;
    className?: string;
}) {
    const ink = '#183354', gold = '#ffcf54', blue = '#6ed9f1', cream = '#fff6da';
    const common = { stroke: ink, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
    let art;
    switch (kind) {
        case 'F01':
        case 'cards':
            art = <><rect x="10" y="14" width="31" height="39" rx="4" fill="#63a9eb" transform="rotate(-13 25 33)"/><rect x="24" y="8" width="31" height="43" rx="4" fill={cream} transform="rotate(11 39 30)"/><path d="m40 17 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill={blue}/></>;
            break;
        case 'F02':
            art = <><path d="M8 10h48L38 32v19l-12 6V32Z" fill={blue}/><path d="M17 19h28M14 45l-6 6 6 6M8 51h13" fill="none"/><path d="m45 44 9-6 2 14Z" fill={gold}/></>;
            break;
        case 'F03':
        case 'energy':
        case 'E':
            art = <path d="M34 5 12 35h18l-4 24 27-35H35l5-19Z" fill={gold}/>;
            break;
        case 'F04':
            art = <><rect x="13" y="8" width="38" height="48" rx="5" fill={cream}/><path d="M33 8v28l9-7 9 7V8Z" fill="#a595f4"/><path d="M21 43h20M21 49h13" fill="none"/></>;
            break;
        case 'F06':
            art = <><path d="M20 9 53 42l-9 9L11 18Z" fill={cream}/><path d="m39 42 12-12M10 54l13-13M7 48l9 9" fill="none" strokeWidth="6"/><path d="m45 7-3 11 11-3M52 22l7 2" fill="none" stroke="#ef855e"/></>;
            break;
        case 'F07':
            art = <><path d="m32 4 8 16 18 3-13 13 3 21-16-10-17 10 3-21L5 23l19-3Z" fill="#ffb86a"/><path d="m31 17-9 16h11l-3 13 15-22H33Z" fill={cream}/></>;
            break;
        case 'F08':
        case 'shield':
            art = <><path d="M32 5 55 14l-3 23c-3 11-12 18-20 23C20 54 13 47 11 37L8 14Z" fill="#69b8ef"/><path d="M32 12v39c-9-6-14-12-15-18l-2-15Z" fill={blue} stroke="none"/><path d="m21 31 8 8 15-18" fill="none" stroke={cream} strokeWidth="6"/></>;
            break;
        case 'D':
            art = <><circle cx="32" cy="32" r="14" fill={gold}/><path d="M32 5v7M32 52v7M5 32h7M52 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5" fill="none" stroke={gold} strokeWidth="6"/></>;
            break;
        case 'C':
            art = <><ellipse cx="31" cy="45" rx="22" ry="10" fill={gold}/><path d="M9 35v10c0 13 44 13 44 0V35" fill={gold}/><ellipse cx="31" cy="35" rx="22" ry="10" fill={cream}/><path d="M13 23v10c0 12 38 12 38 0V23" fill={gold}/><ellipse cx="32" cy="23" rx="19" ry="9" fill={gold}/><path d="M32 17v12M27 20h10M27 26h10" fill="none"/></>;
            break;
        case 'trophy':
            art = <><path d="M19 10H9v13c0 9 7 14 17 14M45 10h10v13c0 9-7 14-17 14" fill={gold}/><path d="M17 6h30v18c0 10-7 17-15 17S17 34 17 24Z" fill={gold}/><path d="M32 41v10M22 56h20M25 51h14" fill="none" strokeWidth="6"/><path d="m32 13 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill={cream} strokeWidth="2"/></>;
            break;
        case 'menu':
            art = <><rect x="11" y="8" width="42" height="48" rx="5" fill={gold}/><path d="M21 21h22M21 32h22M21 43h22" fill="none" strokeWidth="5"/></>;
            break;
        default: art = <><path d="m9 24 23-15 23 15v30H9Z" fill={cream}/><path d="M7 25 32 7l25 18" fill="none" strokeWidth="5"/><path d="M26 54V36h12v18M17 27h7v7h-7ZM40 27h7v7h-7Z" fill={blue}/><path d="M28 15h8" fill="none"/></>;
    }
    return <svg className={`game-icon ${className}`} viewBox="0 0 64 64" aria-hidden="true" {...common}>{art}</svg>;
}
