export type Page='dashboard'|'autopilot'|'accounts'|'channels'|'production'|'content'|'youtube'|'competitors'|'analytics'|'metadata'|'existing'|'publisher'|'settings';
export type AutopilotMode='off'|'assisted'|'full';
export type JobStatus='NEED_IMAGE'|'WAITING_MUSIC'|'READY_RENDER'|'RENDERING'|'READY_UPLOAD'|'UPLOADING'|'SCHEDULED'|'ERROR';
export type Priority='red'|'orange'|'yellow'|'green';
export type MetadataSource='template'|'import'|'ai';

export type Channel={
  id:string; name:string; slug:string; cadenceDays:number; targetBufferDays:number;
  scheduleMode?:'interval'|'pattern'; publishIntervalDays?:number; publishDays?:number; pauseDays?:number; patternAnchorDate?:string;
  publishHour:number; publishMinute:number; language:string; genre:string; country:string;
  minTracks:number; targetDurationMin:number; enabled:boolean; color?:string;
  youtubeProfileId?:string; youtubeChannelId?:string;
  safeDailyUploadLimit?:number; knownUploadLimitState?:'unknown'|'ok'|'limited'; lastDailyLimitError?:string; lastUploadAt?:string;
  seo:{titlePatterns:string[]; descriptionTemplate:string; tags:string[]; banned:string[]; aiPrompt?:string};
  stats?:{subscribers?:number; views?:number; videos?:number; updatedAt?:string};
  analytics?:ChannelAnalytics;
};

export type VideoJob={
  id:string; channelId:string; number:number; folder:string; status:JobStatus; createdAt:string;
  publishAt?:string; coverPath?:string; tracksCount:number; minTracks:number; finalPath?:string;
  title:string; description:string; tags:string[]; error?:string; topic?:string;
  metadataSource?:MetadataSource; metadataLocked?:boolean;
  youtubeVideoId?:string; uploadProgress?:number; uploadedAt?:string;
  thumbnailPath?:string; uploadFingerprint?:string; uploadInterruptedAt?:string; endlumeSentAt?:string;
  renderQueuedAt?:string; lastAutomationAt?:string;
};

export type AnalyticsPoint={date:string;views:number;engagedViews?:number;watchMinutes:number;subscribersGained:number;subscribersLost:number;estimatedRevenue?:number};
export type AnalyticsTopVideo={id:string;title:string;thumbnail?:string;publishedAt?:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;likes:number;comments:number;shares:number;subscribersGained?:number;estimatedRevenue?:number;rpm?:number};
export type AnalyticsBreakdown={key:string;views:number;watchMinutes:number;estimatedRevenue?:number;rpm?:number};
export type ChannelAnalytics={periodDays:number;offsetDays?:number;allTime?:boolean;updatedAt:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;subscribersGained:number;subscribersLost:number;likes:number;comments:number;shares:number;monetaryAuthorized?:boolean;estimatedRevenue?:number;estimatedAdRevenue?:number;estimatedRedPartnerRevenue?:number;monetizedPlaybacks?:number;adImpressions?:number;cpm?:number;playbackBasedCpm?:number;monetaryError?:string;impressions?:number;impressionCtr?:number;daily:AnalyticsPoint[];topVideos:AnalyticsTopVideo[];trafficSources:AnalyticsBreakdown[];countries:AnalyticsBreakdown[];audience?:AnalyticsBreakdown[];channelPublishedAt?:string;channelCountry?:string;channelLanguage?:string;channelThumbnail?:string;totalVideos?:number};
export type CompetitorSnapshot={at:string;subscribers:number;views:number;videos:number;recentAverageViews?:number};
export type CompetitorVideo={id:string;title:string;thumbnail?:string;publishedAt?:string;views:number;likes:number;comments:number};
export type Competitor={id:string;channelId:string;name:string;url:string;youtubeChannelId?:string;thumbnail?:string;subscribers?:number;views?:number;videos?:number;recentAverageViews?:number;lastVideoAt?:string;latestVideos?:CompetitorVideo[];history?:CompetitorSnapshot[];updatedAt?:string;note?:string;similarity?:number;source?:'auto'|'manual'};
export type Settings={
  workspace:string; endlumePath:string; youtubeApiKey:string; autoCheckUpdates:boolean; reduceMotion:boolean; fpsMonitor:boolean;
  autopilotMode:AutopilotMode; autopilotEnabled:boolean; autoCreatePlan:boolean; autoAssignMusic:boolean; autoAssignImages:boolean; autoGenerateMetadata:boolean;
  autoQueueRender:boolean; autoOpenEndlume:boolean; autoUploadYoutube:boolean; autopilotIntervalSec:number; tracksPerVideo:number;
  openaiApiKey:string; openaiModel:string; youtubeOAuthClientId:string; youtubeCategoryId:string;
  youtubeIntelligenceAutoRefresh:boolean; youtubeIntelligenceRefreshMin:number; youtubePublishSafeMode:boolean;
  competitorRpmLow:number; competitorRpmHigh:number; competitorPoolSize:number;
  endlumeTargetDurationMin:number; endlumeTargetRenderSec:number; endlumeTargetFileMinMb:number; endlumeTargetFileMaxMb:number; endlumePreserveImageQuality:boolean; endlumeProjectNaming:string;
};
export type LicenseStatus={valid:boolean;type?:'owner-lifetime'|'monthly'|'development';expiresAt?:string|null;maskedKey?:string};
export type AppState={version:number;channels:Channel[];jobs:VideoJob[];competitors:Competitor[];settings:Settings;logs:{at:string;level:'info'|'warn'|'error';message:string}[]};
export type Diagnostics={ok:boolean;workspaceWritable:boolean;workspaceExists:boolean;dataDir:string;platform:string;appVersion:string;notes:string[]};
export type InboxScan={root:string;music:string[];images:string[];metadata:string[]};
export type YoutubeProfile={id:string;channelId?:string;channelTitle?:string;connectedAt?:string;clientIdMasked?:string;scopes?:string[];analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;preferredBrowser?:string};
export type AutopilotSummary={prepared:number;tracksMoved:number;imagesMoved:number;metadataGenerated:number;renderQueued:number;uploads:number;errors:number;notes:string[]};

export type YoutubeExistingVideo={
  id:string; position:number; title:string; description:string; tags:string[]; categoryId:string;
  publishedAt?:string; privacyStatus:string; publishAt?:string; thumbnail?:string; duration?:string; views?:number; likes?:number; comments?:number; selected:boolean;
  applyState?:'idle'|'saving'|'done'|'error'; error?:string; channelId?:string; verified?:boolean;
};
