"""
Super SPC algo package.

Provides control chart algorithms including:
- Constants tables (d2, d3, c4, c5) and derived factors (A2, A3, B3, B4, D3, D4)
- Sigma estimators for variable and attribute charts
- Control limit computations for 16 chart types
- Western Electric / Nelson rule detection
- Westgard rule detection
"""

# --- Core types ---
from .common.types import ControlLimits, ZoneBreakdown, SigmaResult

# --- Enums ---
from .common.enums import SigmaMethod, ScalingMethod, WithinMethod, BetweenMethod

# --- Constants ---
from .constants.tables import d2, d3, c4, c5
from .constants.factors import A2, A3, B3, B4, D3, D4

# --- Rules ---
from .rules import RuleConfig, RuleViolation, evaluate_rules

# --- Chart modules ---
from .imr import IMRConfig, IMRResult, compute_imr
from .xbar_r import XBarRConfig, XBarRResult, compute_xbar_r
from .xbar_s import XBarSConfig, XBarSResult, compute_xbar_s
from .p_chart import PChartConfig, PChartResult, p_chart
from .np_chart import NPChartConfig, NPChartResult, np_chart
from .c_chart import CChartConfig, CChartResult, c_chart
from .u_chart import UChartConfig, UChartResult, u_chart
from .laney_p import LaneyPConfig, LaneyPResult, laney_p_chart
from .laney_u import LaneyUConfig, LaneyUResult, laney_u_chart
from .cusum import CUSUMConfig, CUSUMResult, compute_cusum
from .ewma import EWMAConfig, EWMAResult, compute_ewma
from .levey_jennings import LeveyJenningsConfig, LeveyJenningsResult, compute_levey_jennings
from .three_way import ThreeWayConfig, ThreeWayResult, compute_three_way
from .short_run import ShortRunConfig, ShortRunResult, compute_short_run
from .g_chart import GChartConfig, GChartResult, compute_g_chart
from .t_chart import TChartConfig, TChartResult, compute_t_chart

__all__ = [
    # Core types
    "ControlLimits",
    "ZoneBreakdown",
    "SigmaResult",
    # Enums
    "SigmaMethod",
    "ScalingMethod",
    "WithinMethod",
    "BetweenMethod",
    # Constants
    "d2",
    "d3",
    "c4",
    "c5",
    "A2",
    "A3",
    "B3",
    "B4",
    "D3",
    "D4",
    # Rules
    "RuleConfig",
    "RuleViolation",
    "evaluate_rules",
    # IMR
    "IMRConfig",
    "IMRResult",
    "compute_imr",
    # XBar-R
    "XBarRConfig",
    "XBarRResult",
    "compute_xbar_r",
    # XBar-S
    "XBarSConfig",
    "XBarSResult",
    "compute_xbar_s",
    # P chart
    "PChartConfig",
    "PChartResult",
    "p_chart",
    # NP chart
    "NPChartConfig",
    "NPChartResult",
    "np_chart",
    # C chart
    "CChartConfig",
    "CChartResult",
    "c_chart",
    # U chart
    "UChartConfig",
    "UChartResult",
    "u_chart",
    # Laney P
    "LaneyPConfig",
    "LaneyPResult",
    "laney_p_chart",
    # Laney U
    "LaneyUConfig",
    "LaneyUResult",
    "laney_u_chart",
    # CUSUM
    "CUSUMConfig",
    "CUSUMResult",
    "compute_cusum",
    # EWMA
    "EWMAConfig",
    "EWMAResult",
    "compute_ewma",
    # Levey-Jennings
    "LeveyJenningsConfig",
    "LeveyJenningsResult",
    "compute_levey_jennings",
    # Three-Way
    "ThreeWayConfig",
    "ThreeWayResult",
    "compute_three_way",
    # Short Run
    "ShortRunConfig",
    "ShortRunResult",
    "compute_short_run",
    # G chart
    "GChartConfig",
    "GChartResult",
    "compute_g_chart",
    # T chart
    "TChartConfig",
    "TChartResult",
    "compute_t_chart",
]
