import {
  type RawPlayer,
  type ProcessedPlayer,
  type PositionCode,
  type PositionGroup,
  POSITION_CODE_TO_GROUP,
} from '../models';

const GK_CODES = new Set(['GK']);

const REQUIRED_COLUMNS = [
  'Player', 'Team', 'Team within selected timeframe', 'Position', 'Age',
  'Market value', 'Contract expires', 'Birth country', 'Passport country',
  'Foot', 'Height', 'Weight', 'On loan', 'Matches played', 'Minutes played',
  'xG per 90', 'Shots per 90', 'Touches in box per 90', 'Progressive runs per 90',
  'xA per 90', 'Shot assists per 90', 'Deep completions per 90',
  'Dribbles per 90', 'Successful dribbles, %', 'Crosses per 90', 'Accurate crosses, %',
  'Passes per 90', 'Progressive passes per 90', 'Key passes per 90',
  'Passes to final third per 90', 'Passes to penalty area per 90',
  'Through passes per 90', 'Smart passes per 90', 'Accurate passes, %',
  'Accurate progressive passes, %', 'Long passes per 90', 'Accurate long passes, %',
  'Accurate smart passes, %', 'PAdj Interceptions', 'PAdj Sliding tackles',
  'Defensive duels per 90', 'Aerial duels per 90', 'Shots blocked per 90',
  'Offensive duels per 90', 'Fouls suffered per 90',
];

export function validateColumns(headers: string[]): { valid: boolean; missing: string[] } {
  const headerSet = new Set(headers);
  const missing = REQUIRED_COLUMNS.filter(col => !headerSet.has(col));
  return { valid: missing.length === 0, missing };
}

export function parsePositionCodes(positionString: string): PositionCode[] {
  return positionString
    .split(',')
    .map(s => s.trim())
    .filter((s): s is PositionCode => s in POSITION_CODE_TO_GROUP || GK_CODES.has(s));
}

function mapToPositionGroup(code: PositionCode): PositionGroup | null {
  return POSITION_CODE_TO_GROUP[code] ?? null;
}

function isGoalkeeper(raw: RawPlayer): boolean {
  const codes = parsePositionCodes(raw.Position);
  return codes.length > 0 && codes[0] === 'GK';
}

export function filterGKs(players: RawPlayer[]): RawPlayer[] {
  return players.filter(p => !isGoalkeeper(p));
}

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function derivedMetric(volumePer90: number, accuracyPct: number): number {
  return safeNum(volumePer90) * safeNum(accuracyPct) / 100;
}

export function rawToProcessed(raw: RawPlayer): ProcessedPlayer {
  const positionCodes = parsePositionCodes(raw.Position);
  const groups = [...new Set(
    positionCodes
      .map(c => mapToPositionGroup(c))
      .filter((g): g is PositionGroup => g !== null)
  )];

  const metrics: Record<string, number> = {
    'xG per 90': safeNum(raw['xG per 90']),
    'Shots per 90': safeNum(raw['Shots per 90']),
    'Touches in box per 90': safeNum(raw['Touches in box per 90']),
    'Progressive runs per 90': safeNum(raw['Progressive runs per 90']),
    'xA per 90': safeNum(raw['xA per 90']),
    'Shot assists per 90': safeNum(raw['Shot assists per 90']),
    'Deep completions per 90': safeNum(raw['Deep completions per 90']),
    'Dribbles per 90': safeNum(raw['Dribbles per 90']),
    'Successful dribbles, %': safeNum(raw['Successful dribbles, %']),
    'Crosses per 90': safeNum(raw['Crosses per 90']),
    'Accurate crosses, %': safeNum(raw['Accurate crosses, %']),
    'Passes per 90': safeNum(raw['Passes per 90']),
    'Progressive passes per 90': safeNum(raw['Progressive passes per 90']),
    'Key passes per 90': safeNum(raw['Key passes per 90']),
    'Passes to final third per 90': safeNum(raw['Passes to final third per 90']),
    'Passes to penalty area per 90': safeNum(raw['Passes to penalty area per 90']),
    'Through passes per 90': safeNum(raw['Through passes per 90']),
    'Smart passes per 90': safeNum(raw['Smart passes per 90']),
    'Accurate passes, %': safeNum(raw['Accurate passes, %']),
    'Accurate progressive passes, %': safeNum(raw['Accurate progressive passes, %']),
    'Long passes per 90': safeNum(raw['Long passes per 90']),
    'Accurate long passes, %': safeNum(raw['Accurate long passes, %']),
    'Accurate smart passes, %': safeNum(raw['Accurate smart passes, %']),
    'PAdj Interceptions': safeNum(raw['PAdj Interceptions']),
    'PAdj Sliding tackles': safeNum(raw['PAdj Sliding tackles']),
    'Defensive duels per 90': safeNum(raw['Defensive duels per 90']),
    'Aerial duels per 90': safeNum(raw['Aerial duels per 90']),
    'Shots blocked per 90': safeNum(raw['Shots blocked per 90']),
    'Offensive duels per 90': safeNum(raw['Offensive duels per 90']),
    'Fouls suffered per 90': safeNum(raw['Fouls suffered per 90']),
  };

  const successfulDribbles_p90 = derivedMetric(raw['Dribbles per 90'], raw['Successful dribbles, %']);
  const accurateCrosses_p90 = derivedMetric(raw['Crosses per 90'], raw['Accurate crosses, %']);
  const accuratePasses_p90 = derivedMetric(raw['Passes per 90'], raw['Accurate passes, %']);
  const accurateProgressivePasses_p90 = derivedMetric(raw['Progressive passes per 90'], raw['Accurate progressive passes, %']);
  const accurateLongPasses_p90 = derivedMetric(raw['Long passes per 90'], raw['Accurate long passes, %']);
  const accurateSmartPasses_p90 = derivedMetric(raw['Smart passes per 90'], raw['Accurate smart passes, %']);

  return {
    id: crypto.randomUUID(),
    name: raw.Player,
    team: raw.Team,
    teamInTimeframe: raw['Team within selected timeframe'],
    position: raw.Position,
    positionCodes,
    primaryGroup: groups[0] ?? 'CM',
    allGroups: groups,
    age: safeNum(raw.Age),
    marketValue: safeNum(raw['Market value']),
    contractExpires: raw['Contract expires'] ?? '',
    birthCountry: raw['Birth country'] ?? '',
    passportCountry: raw['Passport country'] ?? '',
    foot: raw.Foot ?? '',
    height: safeNum(raw.Height),
    weight: safeNum(raw.Weight),
    onLoan: raw['On loan'] === 'Yes' || raw['On loan'] === 'true',
    matchesPlayed: safeNum(raw['Matches played']),
    minutesPlayed: safeNum(raw['Minutes played']),
    metrics,
    successfulDribbles_p90,
    accurateCrosses_p90,
    accuratePasses_p90,
    accurateProgressivePasses_p90,
    accurateLongPasses_p90,
    accurateSmartPasses_p90,
    zScores: { att: [], pas: [], def: [] },
    percentiles: { att: [], pas: [], def: [] },
  };
}
