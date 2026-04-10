export type PositionCode =
  | 'CB' | 'LCB' | 'RCB'
  | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'DMF' | 'LDMF' | 'RDMF'
  | 'LCMF' | 'RCMF'
  | 'AMF' | 'LAMF' | 'RAMF'
  | 'LW' | 'RW' | 'LWF' | 'RWF'
  | 'CF'
  | 'GK';

export type PositionGroup = 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'CF';

export interface RawPlayer {
  Player: string;
  Team: string;
  'Team within selected timeframe': string;
  Position: string;
  Age: number;
  'Market value': number;
  'Contract expires': string;
  'Birth country': string;
  'Passport country': string;
  Foot: string;
  Height: number;
  Weight: number;
  'On loan': string;
  'Matches played': number;
  'Minutes played': number;

  'xG per 90': number;
  'Shots per 90': number;
  'Touches in box per 90': number;
  'Progressive runs per 90': number;
  'xA per 90': number;
  'Shot assists per 90': number;
  'Deep completions per 90': number;
  'Dribbles per 90': number;
  'Successful dribbles, %': number;
  'Crosses per 90': number;
  'Accurate crosses, %': number;
  'Passes per 90': number;
  'Progressive passes per 90': number;
  'Key passes per 90': number;
  'Passes to final third per 90': number;
  'Passes to penalty area per 90': number;
  'Through passes per 90': number;
  'Smart passes per 90': number;
  'Accurate passes, %': number;
  'Accurate progressive passes, %': number;
  'Long passes per 90': number;
  'Accurate long passes, %': number;
  'Accurate smart passes, %': number;
  'PAdj Interceptions': number;
  'PAdj Sliding tackles': number;
  'Defensive duels per 90': number;
  'Aerial duels per 90': number;
  'Shots blocked per 90': number;
  'Offensive duels per 90': number;
  'Fouls suffered per 90': number;
}

export interface ProcessedPlayer {
  id: string;
  name: string;
  team: string;
  teamInTimeframe: string;
  position: string;
  positionCodes: PositionCode[];
  primaryGroup: PositionGroup;
  allGroups: PositionGroup[];
  age: number;
  marketValue: number;
  contractExpires: string;
  birthCountry: string;
  passportCountry: string;
  foot: string;
  height: number;
  weight: number;
  onLoan: boolean;
  matchesPlayed: number;
  minutesPlayed: number;

  metrics: Record<string, number>;

  successfulDribbles_p90: number;
  accurateCrosses_p90: number;
  accuratePasses_p90: number;
  accurateProgressivePasses_p90: number;
  accurateLongPasses_p90: number;
  accurateSmartPasses_p90: number;

  zScores: {
    att: number[];
    pas: number[];
    def: number[];
  };

  percentiles: {
    att: number[];
    pas: number[];
    def: number[];
  };
}

export const POSITION_CODE_TO_GROUP: Record<string, PositionGroup> = {
  CB: 'CB', LCB: 'CB', RCB: 'CB',
  LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB',
  DMF: 'DM', LDMF: 'DM', RDMF: 'DM',
  LCMF: 'CM', RCMF: 'CM',
  AMF: 'AM', LAMF: 'AM', RAMF: 'AM',
  LW: 'W', RW: 'W', LWF: 'W', RWF: 'W',
  CF: 'CF',
};

export const ATT_METRICS = [
  'xG per 90',
  'Shots per 90',
  'Touches in box per 90',
  'Progressive runs per 90',
  'Shot assists per 90',
  'Deep completions per 90',
  'successfulDribbles_p90',
  'Offensive duels per 90',
  'Fouls suffered per 90',
] as const;

export const PAS_METRICS = [
  'xA per 90',
  'Key passes per 90',
  'Passes to final third per 90',
  'Passes to penalty area per 90',
  'Through passes per 90',
  'accuratePasses_p90',
  'accurateProgressivePasses_p90',
  'accurateLongPasses_p90',
  'accurateSmartPasses_p90',
  'accurateCrosses_p90',
] as const;

export const DEF_METRICS = [
  'PAdj Interceptions',
  'PAdj Sliding tackles',
  'Defensive duels per 90',
  'Aerial duels per 90',
  'Shots blocked per 90',
] as const;

/** Minutes threshold for Bayesian shrinkage — at this value, observed data gets 50% weight. */
export const SHRINKAGE_PRIOR_MINUTES = 900;

