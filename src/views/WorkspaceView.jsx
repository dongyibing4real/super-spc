import RecipeRail from "../components/RecipeRail.jsx";
import ChartArena from "../components/ChartArena.jsx";
import EvidenceRail from "../components/EvidenceRail.jsx";

export default function WorkspaceView() {
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
