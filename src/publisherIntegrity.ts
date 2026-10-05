import type {ImportedMetadata} from './metadata';
import type {VideoJob} from './types';

export type PublisherIntegrityIssueCode=
 |'FINAL_TITLE_EMPTY'
 |'FINAL_TITLE_RESERVED'
 |'FINAL_TITLE_TECHNICAL_PLACEHOLDER'
 |'METADATA_CHANNEL_MISMATCH'
 |'METADATA_GENERATION_STALE';

export type PublisherIntegrityIssue={code:PublisherIntegrityIssueCode;message:string};
export type FinalUploadPayload={title:string;description:string;tags:readonly string[];publishAt?:string;categoryId?:string};
export type PublisherIntegrityChannel={id:string;name:string};

const RESERVED_TITLES=new Set(['LOGIC','TITLE','НАЗВАНИЕ']);
const TECHNICAL_VIDEO_TITLE=/^VIDEO[\s_-]*0*\d+$/i;
const normalize=(value?:string)=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
const fingerprint=(value?:string)=>String(value||'').trim().toLowerCase();

export function metadataChannelMatches(value:string|undefined,channel:PublisherIntegrityChannel){
 if(!value?.trim())return true;
 const actual=normalize(value);
 return actual===normalize(channel.id)||actual===normalize(channel.name);
}

export function metadataGenerationMatches(row:ImportedMetadata|undefined,job:Pick<VideoJob,'id'|'channelId'|'sourceGenerationKey'|'currentSourceFingerprint'|'currentSourceFileSize'>){
 if(!row)return true;
 if(row.metadataBindingIssue==='METADATA_GENERATION_STALE')return false;
 if(row.metadataBindingIssue==='METADATA_CHANNEL_MISMATCH')return true;
 if(row.metadataLegacyPersisted&&!row.boundJobId)return false;
 if(row.boundChannelId&&row.boundChannelId!==job.channelId)return false;
 if(row.boundJobId&&row.boundJobId!==job.id)return false;
 if(row.boundSourceGenerationKey&&job.sourceGenerationKey&&row.boundSourceGenerationKey!==job.sourceGenerationKey)return false;
 if(row.boundSourceFingerprint&&job.currentSourceFingerprint&&fingerprint(row.boundSourceFingerprint)!==fingerprint(job.currentSourceFingerprint))return false;
 if(row.boundSourceFileSize!=null&&job.currentSourceFileSize!=null&&Number(row.boundSourceFileSize)!==Number(job.currentSourceFileSize))return false;
 return true;
}

export function validateFinalUploadPayload(input:{
 job:Pick<VideoJob,'id'|'number'|'channelId'|'sourceGenerationKey'|'currentSourceFingerprint'|'currentSourceFileSize'>;
 channel:PublisherIntegrityChannel;
 payload:FinalUploadPayload;
 metadata?:ImportedMetadata;
 metadataSource?:string;
 safeMode?:boolean;
}){
 const issues:PublisherIntegrityIssue[]=[];
 const title=String(input.payload.title||'').trim(),upper=title.toLocaleUpperCase('ru-RU');
 if(!title)issues.push({code:'FINAL_TITLE_EMPTY',message:'финальное название пустое'});
 else if(RESERVED_TITLES.has(upper))issues.push({code:'FINAL_TITLE_RESERVED',message:`запрещённое служебное название «${title}»`});
 else if(input.safeMode!==false&&TECHNICAL_VIDEO_TITLE.test(title))issues.push({code:'FINAL_TITLE_TECHNICAL_PLACEHOLDER',message:`технический placeholder «${title}» нельзя публиковать как финальное название`});

 const row=input.metadata;
 if(row?.metadataBindingIssue==='METADATA_CHANNEL_MISMATCH'||(row?.channel&&!metadataChannelMatches(row.channel,input.channel))){
  issues.push({code:'METADATA_CHANNEL_MISMATCH',message:`метаданные предназначены для канала «${row?.channel||'другой канал'}», активный канал «${input.channel.name}»`});
 }
 if(row&&!metadataGenerationMatches(row,input.job)){
  issues.push({code:'METADATA_GENERATION_STALE',message:'метаданные относятся к другой физической генерации этого VIDEO'});
 }
 return {valid:issues.length===0,issues};
}

export function publisherIntegrityError(jobNumber:number,issues:PublisherIntegrityIssue[]){
 const video=`VIDEO_${String(jobNumber).padStart(3,'0')}`;
 const error=new Error(`${video}: ${issues.map(x=>`${x.code}: ${x.message}`).join(' • ')}`);
 (error as Error&{code?:string}).code=issues[0]?.code||'PUBLISHER_INTEGRITY_BLOCKED';
 return error;
}

export function assertFinalUploadPayload(input:Parameters<typeof validateFinalUploadPayload>[0]){
 const result=validateFinalUploadPayload(input);
 if(!result.valid)throw publisherIntegrityError(input.job.number,result.issues);
 return result;
}

export function validateImmutableUploadSpec(spec:{jobId:string;videoNumber:number;channelId:string;channelName:string;title:string},safeMode=true){
 return validateFinalUploadPayload({
  job:{id:spec.jobId,number:spec.videoNumber,channelId:spec.channelId},
  channel:{id:spec.channelId,name:spec.channelName},
  payload:{title:spec.title,description:'',tags:[]},
  safeMode
 });
}
