"use client";

import dynamic from "next/dynamic";

// The grid renders to a canvas and needs the browser; skip server prerendering.
const Grid = dynamic(() => import("../components/Grid").then(m => m.Grid), { ssr: false });

export default function Home() {
    return <Grid />;
}
