import { type ExpansionCategory, type PositionGroup, ATT_METRICS, PAS_METRICS, DEF_METRICS } from './models';

export const POSITION_GROUP_COLORS: Record<PositionGroup, string> = {
  CB: '#378add',
  FB: '#1d9e75',
  DM: '#ba7517',
  CM: '#534ab7',
  AM: '#e8593c',
  W: '#d44d8a',
  CF: '#c93030',
};

export const CATEGORY_COLORS: Record<ExpansionCategory, string> = {
  att: '#e8593c',
  pas: '#1d9e75',
  def: '#378add',
};

export const CATEGORY_LABELS: Record<ExpansionCategory, string> = {
  att: 'Attacking',
  pas: 'Passing',
  def: 'Defensive',
};

export const CATEGORY_METRICS: Record<ExpansionCategory, readonly string[]> = {
  att: ATT_METRICS,
  pas: PAS_METRICS,
  def: DEF_METRICS,
};

export const METRIC_LABELS: Record<string, string> = {
  'xG per 90': 'xG/90',
  'Shots per 90': 'Shots/90',
  'Touches in box per 90': 'Box touches/90',
  'Progressive runs per 90': 'Prog runs/90',
  'xA per 90': 'xA/90',
  'Shot assists per 90': 'Shot assists/90',
  'Deep completions per 90': 'Deep comp/90',
  'successfulDribbles_p90': 'Succ dribbles/90',
  'accurateCrosses_p90': 'Acc crosses/90',
  'Passes per 90': 'Passes/90',
  'Progressive passes per 90': 'Prog passes/90',
  'Key passes per 90': 'Key passes/90',
  'Passes to final third per 90': 'Final 3rd/90',
  'Passes to penalty area per 90': 'Pen area/90',
  'Through passes per 90': 'Through/90',
  'Smart passes per 90': 'Smart passes/90',
  'accuratePasses_p90': 'Acc passes/90',
  'accurateProgressivePasses_p90': 'Acc prog/90',
  'accurateLongPasses_p90': 'Acc long/90',
  'accurateSmartPasses_p90': 'Acc smart/90',
  'PAdj Interceptions': 'PAdj Int',
  'PAdj Sliding tackles': 'PAdj Tkl',
  'Defensive duels per 90': 'Def duels/90',
  'Aerial duels per 90': 'Aerial/90',
  'Shots blocked per 90': 'Blocks/90',
  'Offensive duels per 90': 'Off duels/90',
  'Fouls suffered per 90': 'Fouls suf/90',
};

export const METRIC_SHORT_LABELS: Record<string, string> = {
  'xG per 90': 'xG',
  'Shots per 90': 'Shots',
  'Touches in box per 90': 'Box touches',
  'Progressive runs per 90': 'Prog runs',
  'xA per 90': 'xA',
  'Shot assists per 90': 'Shot ast',
  'Deep completions per 90': 'Deep comp',
  'successfulDribbles_p90': 'Dribbles',
  'accurateCrosses_p90': 'Crosses',
  'Passes per 90': 'Passes',
  'Progressive passes per 90': 'Prog pass',
  'Key passes per 90': 'Key pass',
  'Passes to final third per 90': 'Final 3rd',
  'Passes to penalty area per 90': 'Pen area',
  'Through passes per 90': 'Through',
  'Smart passes per 90': 'Smart',
  'accuratePasses_p90': 'Acc pass',
  'accurateProgressivePasses_p90': 'Acc prog',
  'accurateLongPasses_p90': 'Acc long',
  'accurateSmartPasses_p90': 'Acc smart',
  'PAdj Interceptions': 'PAdj Int',
  'PAdj Sliding tackles': 'PAdj Tkl',
  'Defensive duels per 90': 'Def duels',
  'Aerial duels per 90': 'Aerial',
  'Shots blocked per 90': 'Blocks',
  'Offensive duels per 90': 'Off duels',
  'Fouls suffered per 90': 'Fouls suf',
};

export const MAX_SELECTED_NODES = 4;
export const TOP_SIMILARITIES_COUNT = 3;
export const AUTO_THRESHOLD_TARGET = 9;
export const FORCE_SIMULATION_TICKS = 300;
export const ZOOM_PADDING = 60;
export const ZOOM_PADDING_INITIAL = 80;
