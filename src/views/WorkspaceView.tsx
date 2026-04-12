import React from "react";
import RecipeRail from "../components/recipe-rail/RecipeRail.jsx";
import ChartArena from "../components/ChartArena.jsx";
import EvidenceRail from "../components/EvidenceRail.jsx";

export default function WorkspaceView(): React.JSX.Element {
  return (
    <div className="workspace-layout">
      <RecipeRail />
      <div className="workspace-main">
        <ChartArena />
      </div>
      <EvidenceRail />
    </div>
  );
}
