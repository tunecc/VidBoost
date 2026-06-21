export type SubtitleFragment = {
  text: string;
  start: number;
  end: number;
};

export type TimedTextSeg = {
  utf8: string;
  tOffsetMs?: number;
};

export type TimedTextEvent = {
  tStartMs: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: TimedTextSeg[];
  wpWinPosId?: number;
  wWinId?: number;
};

export type SubtitleFormat =
  | 'animated'
  | 'stylized-karaoke'
  | 'karaoke'
  | 'scrolling-asr'
  | 'standard';

export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  vssId: string;
  name?: {
    simpleText?: string;
  };
  trackName?: string;
};

export type PotToken = {
  pot: string | null;
  potc: string | null;
};
