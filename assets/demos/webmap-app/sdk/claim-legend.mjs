// Tag ownership, decided explicitly (SDK issue #679): this page wants the
// controls-kit <honua-legend>, whose derive mode parses categories out of a
// live MapLibre paint expression. It must claim the tag BEFORE
// "@honua/app-platform/web-components" evaluates, because that entry auto-registers
// its own (controller-driven) honua-legend if the tag is still free. The bundle
// entry imports this module first, so ES module evaluation order guarantees it.
import { defineHonuaLegend } from "@honua/app-platform/controls";

defineHonuaLegend();
