import type {ImportedMetadata} from './metadata';

export type MetadataQueueStatus='AVAILABLE'|'RESERVED'|'APPLYING'|'APPLIED'|'SAFE_TO_PURGE'|'ERROR';

export type MetadataQueueRecord={
  id:string;
  channelId:string;
  packId:string;
  sequence:number;
  sourceNumber?:number;
  title?:string;
  description?:string;
  tags:string[];
  publishAt?:string;
  publishTime?:string;
  publishTimezone?:string;
  publishUtcOffsetMinutes?:number;
  status:MetadataQueueStatus;
  reservedJobId?:string;
  reservedVideoNumber?:number;
  youtubeVideoId?:string;
  createdAt:string;
  reservedAt?:string;
  appliedAt?:string;
  sourceHash:string;
  recordHash:string;
  error?:string;
};

export type MetadataQueueSummary={
  channelId:string;
  total:number;
  activeTotal:number;
  available:number;
  reserved:number;
  applying:number;
  applied:number;
  error:number;
  packs:number;
  completePacks:number;
  purgedPacks:number;
  completePackIds:string[];
  nextSequence?:number;
};

export type MetadataQueuePage={
  channelId:string;
  offset:number;
  limit:number;
  totalMatching:number;
  rows:MetadataQueueRecord[];
};

export type MetadataQueueImportResult={
  packId:string;
  packHash:string;
  existing:number;
  added:number;
  duplicate:boolean;
  summary:MetadataQueueSummary;
};

export type MetadataQueueInput={
  sourceNumber?:number;
  title?:string;
  description?:string;
  tags:string[];
  publishAt?:string;
  publishTime?:string;
  publishTimezone?:string;
  publishUtcOffsetMinutes?:number;
};

export function metadataQueueInput(row:ImportedMetadata):MetadataQueueInput{
  return {
    sourceNumber:row.number,
    title:row.title,
    description:row.description,
    tags:[...(row.tags||[])],
    publishAt:row.publishAt,
    publishTime:row.publishTime,
    publishTimezone:row.publishTimezone,
    publishUtcOffsetMinutes:row.publishUtcOffsetMinutes,
  };
}

export function metadataQueueRowAsImported(row:MetadataQueueRecord):ImportedMetadata{
  return {
    number:row.sourceNumber??row.sequence,
    title:row.title,
    description:row.description,
    tags:[...row.tags],
    publishAt:row.publishAt,
    publishTime:row.publishTime,
    publishTimezone:row.publishTimezone,
    publishUtcOffsetMinutes:row.publishUtcOffsetMinutes,
    source:`queue:${row.packId}:${row.id}`,
  };
}

export function metadataQueueLowStockThreshold(dailyTarget?:number){
  return Math.max(10,Math.ceil(Math.max(1,dailyTarget||1)*2));
}

export function metadataQueuePublishAtIsFuture(value?:string,now=Date.now()){
  if(!value)return false;
  const at=Date.parse(value);
  return Number.isFinite(at)&&at>now;
}

export type MetadataQueueReservationRequest={jobId:string;videoNumber:number;projectFolder?:string};
export type MetadataQueueReservationResult={jobId:string;record:MetadataQueueRecord|null};
