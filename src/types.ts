export type Page='dashboard'|'autopilot'|'accounts'|'channels'|'production'|'content'|'youtube'|'competitors'|'analytics'|'metadata'|'existing'|'publisher'|'settings';
export type AutopilotMode='off'|'assisted'|'full';
export type JobStatus='NEED_IMAGE'|'WAITING_MUSIC'|'READY_RENDER'|'RENDERING'|'READY_UPLOAD'|'UPLOADING'|'SCHEDULED'|'ERROR';
export type Priority='red'|'orange'|'yellow'|'green';
export type MetadataSource='template'|'import'|'ai';
export type StorageLifecycleState='NEW'|'RENDERED'|'QUEUED'|'UPLOADING'|'UPLOADED'|'FAILED'|'TRASHED'|'TRASHED_BY_VYRON';
export type SourceLifecycleState='PRESENT'|'TRASH_REQUESTED'|'TRASHED_BY_VYRON'|'MISSING_EXTERNAL'|'MISSING_LEGACY_UNKNOWN'|'SOURCE_CHANGED'|'ARCHIVED';
export type YoutubeProcessingState='UPLOAD_ACCEPTED'|'YOUTUBE_PROCESSING'|'READY'|'PROCESSING_FAILED'|'REJECTED'|'PROCESSING_UNKNOWN';
export type FingerprintProofSource='UPLOAD_TIME'|'UPLOAD_RESUME_TIME'|'LEGACY_RECONSTRUCTED'|'UNKNOWN';
export type UploadHistoryRecord={id:string;jobId:string;channelId:string;profileId?:string;youtubeChannelId?:string;youtubeVideoId:string;localFilePath:string;originalFilename:string;projectId?:string;sourceProjectPath?:string;batchId?:string;titleAtUpload?:string;uploadedAt:string;fileSize:number;sha256:string;publishAt?:string;status:'UPLOADED';fingerprintProofSource?:FingerprintProofSource;fingerprintCapturedAt?:string;sourceGenerationKeyAtUpload?:string;uploadOperationId?:string;proofSchemaVersion?:number;overrideDuplicate?:boolean;trashedAt?:string;trashOperationId?:string;sourceLifecycle?:SourceLifecycleState;sourceCheckedAt?:string;remoteExists?:boolean;remoteCheckedAt?:string;processingState?:YoutubeProcessingState;processingCheckedAt?:string;processingStatus?:string;processingError?:string;readyAt?:string;identityVerifiedAt?:string;staleLinkClearedAt?:string;staleLinkClearReason?:string};
export type ActivityEventType='RENDER_COMPLETED'|'RENDER_DISCOVERED_LEGACY'|'RENDER_FOLDER_SCANNED'|'LOCAL_VIDEO_DISCOVERED'|'UPLOAD_QUEUED'|'UPLOAD_STARTED'|'UPLOAD_PROGRESS'|'UPLOAD_ACCEPTED'|'UPLOAD_BLOCKED_DUPLICATE_GUARD'|'REMOTE_VIDEO_VERIFIED'|'REMOTE_VIDEO_MISSING'|'REMOTE_LINK_CLEARED'|'RECONCILIATION_COMPLETED'|'YOUTUBE_PROCESSING'|'YOUTUBE_READY'|'UPLOAD_FAILED'|'METADATA_UPDATE_STARTED'|'METADATA_UPDATE_SUCCEEDED'|'METADATA_UPDATE_FAILED'|'TITLE_UPDATED'|'DESCRIPTION_UPDATED'|'TAGS_UPDATED'|'SCHEDULE_UPDATED'|'PRIVACY_UPDATED'|'THUMBNAIL_UPDATED'|'INVENTORY_SYNC_STARTED'|'INVENTORY_SYNC_COMPLETED'|'INVENTORY_SYNC_PARTIAL'|'SOURCE_TRASH_REQUESTED'|'SOURCE_TRASHED'|'SOURCE_MISSING'|'SOURCE_RECOVERED'|'OAUTH_KEYCHAIN_ACCESS_DENIED'|'OAUTH_KEYCHAIN_ACCESS_RECOVERED'|'OAUTH_PROFILE_RECONNECT_REQUIRED'|'OAUTH_PROFILE_RECONNECTED'|'OAUTH_CREDENTIAL_ROTATED'|'OAUTH_VALIDATION_PASS'|'OAUTH_RECONNECT'|'CHANNEL_REBOUND'|'STATS_REFRESH_BATCH'|'CHANNEL_STATS_REFRESH'|'RECOVERY_SESSION_DETECTED'|'RECOVERY_STARTED'|'RECOVERY_COMPLETED'|'RECOVERY_WAITING'|'RECOVERY_ABANDONED';
export type ActivityStatus='STARTED'|'SUCCESS'|'FAILED'|'PARTIAL'|'INFO';
export type ActivitySource='LIVE_OPERATION'|'RECONSTRUCTED'|'LEGACY_IMPORT';
export type ActivityDetailValue=string|number|boolean|null|string[]|number[];
export type ActivityEvent={eventId:string;operationId?:string;batchId?:string;timestamp:string;channelId?:string;channelName?:string;profileId?:string;jobId?:string;youtubeVideoId?:string;localSourcePath?:string;eventType:ActivityEventType;status:ActivityStatus;details?:Record<string,ActivityDetailValue>;errorCode?:string;source:ActivitySource};

export type FingerprintCacheEntry={path:string;size:number;mtimeMs:number;sha256:string;computedAt:string};
export type ProjectLifecycleRecord={projectId:string;jobId?:string;projectPath:string;renderPath?:string;status:'RENDERED'|'SAFE_TO_CLEAN';renderExists:boolean;youtubeVideoId?:string;uploadedAt?:string;updatedAt:string};

export type ChannelStatisticsSnapshotSource='LIVE_REFRESH'|'MIGRATED_BASELINE';
export type ChannelStatisticsSnapshot={snapshotId:string;channelId:string;youtubeChannelId:string;profileId:string;capturedAt:string;subscriberCount?:number;hiddenSubscriberCount:boolean;viewCount:number;videoCount:number;source:ChannelStatisticsSnapshotSource};
export type ChannelStatisticsHistory=Record<string,ChannelStatisticsSnapshot[]>;

export type YoutubeChannelStatistics={
  channelId?:string; channelTitle?:string; handle?:string; thumbnail?:string;
  publishedAt?:string; country?:string; defaultLanguage?:string;
  subscriberCount?:number; viewCount?:number; videoCount?:number; hiddenSubscriberCount?:boolean;
  statisticsUpdatedAt?:string; lastAttemptAt?:string; syncWarning?:string;
  // Legacy aliases retained for compatibility with pre-2.1.14 views/state.
  subscribers?:number; views?:number; videos?:number; updatedAt?:string;
};

export type Channel={
  id:string; name:string; slug:string; cadenceDays:number; targetBufferDays:number;
  scheduleMode?:'interval'|'pattern'; publishIntervalDays?:number; publishDays?:number; pauseDays?:number; patternAnchorDate?:string;
  publishHour:number; publishMinute:number; language:string; genre:string; country:string;
  minTracks:number; targetDurationMin:number; enabled:boolean; color?:string;
  youtubeProfileId?:string; youtubeChannelId?:string;
  renderFolderPath?:string; projectsFolderPath?:string;
  safeDailyUploadLimit?:number; knownUploadLimitState?:'unknown'|'ok'|'limited'; lastDailyLimitError?:string; lastUploadAt?:string;
  seo:{titlePatterns:string[]; descriptionTemplate:string; tags:string[]; banned:string[]; aiPrompt?:string};
  stats?:YoutubeChannelStatistics;
  analytics?:ChannelAnalytics;
};

export type VideoJob={
  id:string; channelId:string; number:number; folder:string; status:JobStatus; createdAt:string;
  publishAt?:string; coverPath?:string; tracksCount:number; minTracks:number; finalPath?:string;
  title:string; description:string; tags:string[]; error?:string; topic?:string;
  metadataSource?:MetadataSource; metadataLocked?:boolean;
  youtubeVideoId?:string; uploadProgress?:number; uploadedAt?:string; storageLifecycle?:StorageLifecycleState;
  uploadAcceptedAt?:string; processingState?:YoutubeProcessingState; processingCheckedAt?:string; processingError?:string;
  remoteExists?:boolean; remoteCheckedAt?:string; identityVerifiedAt?:string; remotePrivacyStatus?:string;
  thumbnailPath?:string; uploadFingerprint?:string; uploadInterruptedAt?:string; endlumeSentAt?:string; removedFromPublishList?:boolean;
  currentSourceFingerprint?:string; currentSourceFileSize?:number; currentSourceModifiedAt?:number; sourceGenerationKey?:string; sourcePreviousJobId?:string;
  sourceOrigin?:'render-scan'; scanRecoveryState?:'CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED';
  renderQueuedAt?:string; lastAutomationAt?:string;
};

export type AnalyticsPoint={date:string;views:number;engagedViews?:number;watchMinutes:number;subscribersGained:number;subscribersLost:number;estimatedRevenue?:number};
export type AnalyticsTopVideo={id:string;title:string;thumbnail?:string;publishedAt?:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;likes:number;comments:number;shares:number;subscribersGained?:number;estimatedRevenue?:number;rpm?:number};
export type AnalyticsBreakdown={key:string;views:number;watchMinutes:number;estimatedRevenue?:number;rpm?:number};
export type ChannelAnalytics={periodDays:number;offsetDays?:number;allTime?:boolean;updatedAt:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;subscribersGained:number;subscribersLost:number;likes:number;comments:number;shares:number;monetaryAuthorized?:boolean;estimatedRevenue?:number;estimatedAdRevenue?:number;estimatedRedPartnerRevenue?:number;monetizedPlaybacks?:number;adImpressions?:number;cpm?:number;playbackBasedCpm?:number;monetaryError?:string;impressions?:number;impressionCtr?:number;daily:AnalyticsPoint[];topVideos:AnalyticsTopVideo[];trafficSources:AnalyticsBreakdown[];countries:AnalyticsBreakdown[];audience?:AnalyticsBreakdown[];devices?:AnalyticsBreakdown[];channelPublishedAt?:string;channelCountry?:string;channelLanguage?:string;channelThumbnail?:string;totalVideos?:number};
export type CompetitorSnapshot={at:string;subscribers:number;views:number;videos:number;recentAverageViews?:number};
export type CompetitorVideo={id:string;title:string;thumbnail?:string;publishedAt?:string;views:number;likes:number;comments:number};
export type Competitor={id:string;channelId:string;name:string;url:string;youtubeChannelId?:string;handle?:string;publishedAt?:string;country?:string;thumbnail?:string;subscribers?:number;views?:number;videos?:number;recentAverageViews?:number;lastVideoAt?:string;latestVideos?:CompetitorVideo[];history?:CompetitorSnapshot[];updatedAt?:string;note?:string;similarity?:number;source?:'auto'|'manual'};
export type Settings={
  workspace:string; endlumePath:string; youtubeApiKey:string; autoCheckUpdates:boolean; reduceMotion:boolean; fpsMonitor:boolean; interfaceDensity:'compact'|'comfortable';
  autopilotMode:AutopilotMode; autopilotEnabled:boolean; autoCreatePlan:boolean; autoAssignMusic:boolean; autoAssignImages:boolean; autoGenerateMetadata:boolean;
  autoQueueRender:boolean; autoOpenEndlume:boolean; autoUploadYoutube:boolean; autopilotIntervalSec:number; tracksPerVideo:number;
  openaiApiKey:string; openaiModel:string; youtubeOAuthClientId:string; youtubeCategoryId:string;
  youtubeIntelligenceAutoRefresh:boolean; youtubeIntelligenceRefreshMin:number; youtubePublishSafeMode:boolean; youtubeUploadConcurrency:number; youtubeUploadPerChannelConcurrency:number; metadataConcurrency:number; statisticsConcurrency:number;
  competitorRpmLow:number; competitorRpmHigh:number; competitorPoolSize:number;
  publishedVideoCleanupPolicy?:'ask'|'none'|'after3d'|'after7d'; completedProjectCleanupPolicy?:'ask'|'none'|'after3d'|'after7d';
  endlumeTargetDurationMin:number; endlumeTargetRenderSec:number; endlumeTargetFileMinMb:number; endlumeTargetFileMaxMb:number; endlumePreserveImageQuality:boolean; endlumeProjectNaming:string;
};
export type LicenseStatus={valid:boolean;type?:'owner-lifetime'|'monthly'|'development';expiresAt?:string|null;maskedKey?:string};
export type AppState={version:number;channels:Channel[];jobs:VideoJob[];competitors:Competitor[];settings:Settings;logs:{at:string;level:'info'|'warn'|'error';message:string}[];uploadHistory:UploadHistoryRecord[];activityJournal:ActivityEvent[];statisticsHistory:ChannelStatisticsHistory;fingerprintCache:Record<string,FingerprintCacheEntry>;projectLifecycle:Record<string,ProjectLifecycleRecord>};
export type Diagnostics={ok:boolean;workspaceWritable:boolean;workspaceExists:boolean;dataDir:string;platform:string;appVersion:string;notes:string[]};
export type InboxScan={root:string;music:string[];images:string[];metadata:string[]};
export type YoutubeProfile={id:string;channelId?:string;channelTitle?:string;googleEmail?:string;googleSubjectId?:string;connectedAt?:string;clientIdMasked?:string;scopes?:string[];analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;preferredBrowser?:string;credentialStatus?:'READY'|'WORKING'|'NEEDS_ONE_TIME_LOCAL_MIGRATION'|'KEYCHAIN_BLOCKED'|'RECONNECT_REQUIRED'|'MISSING'|'WRONG_CHANNEL'|'FAILED'|'NOT_CHECKED'|'CANONICAL_PRESENT_UNVERIFIED'|'RECOVERABLE'|'KEYCHAIN_ERROR'|'CHECK_ON_USE';credentialError?:string|null;identityValidatedAt?:string|null;statistics?:YoutubeChannelStatistics};
export type AutopilotSummary={prepared:number;tracksMoved:number;imagesMoved:number;metadataGenerated:number;renderQueued:number;uploads:number;errors:number;notes:string[]};

export type YoutubeExistingVideo={
  id:string; position:number; title:string; description:string; tags:string[]; categoryId:string;
  publishedAt?:string; privacyStatus:string; publishAt?:string; thumbnail?:string; duration?:string; views?:number; likes?:number; comments?:number; selected:boolean;
  applyState?:'idle'|'saving'|'done'|'error'; error?:string; channelId?:string; verified?:boolean;
};
