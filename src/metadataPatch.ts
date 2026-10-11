import type {ImportedMetadata} from './metadata';
import type {YoutubeExistingVideo} from './types';

export type YoutubeExistingMutationPatch={
  title?:string;
  description?:string;
  tags?:string[];
  publishAt?:string;
  privacyStatus?:'private'|'public'|'unlisted';
  categoryId?:string;
};

export function buildExistingMetadataPatch(
  video:YoutubeExistingVideo,
  row:ImportedMetadata,
  options:{scheduleEditEnabled:boolean;publishAt?:string}
):YoutubeExistingMutationPatch{
  const patch:YoutubeExistingMutationPatch={};
  if(row.title&&row.title!==video.title)patch.title=row.title;
  if(row.description&&row.description!==video.description)patch.description=row.description;
  if(row.tags?.length&&JSON.stringify(row.tags)!==JSON.stringify(video.tags))patch.tags=row.tags;
  if(options.scheduleEditEnabled&&options.publishAt&&(options.publishAt||'')!==(video.publishAt||''))patch.publishAt=options.publishAt;
  return patch
}
