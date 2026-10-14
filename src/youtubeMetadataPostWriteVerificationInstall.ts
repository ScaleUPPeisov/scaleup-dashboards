import { api, type YoutubeExistingMutationPatch } from './api';
import {
  runMetadataUpdateWithSemanticVerification,
  type MetadataUpdateVerificationResult,
} from './youtubeMetadataPostWriteVerification';

const backendYoutubeUpdateExisting = api.youtubeUpdateExisting.bind(api);

api.youtubeUpdateExisting = (
  profileId: string,
  videoId: string,
  patch: YoutubeExistingMutationPatch,
  operationId?: string,
) =>
  runMetadataUpdateWithSemanticVerification(
    backendYoutubeUpdateExisting as (
      profileId: string,
      videoId: string,
      patch: YoutubeExistingMutationPatch,
      operationId?: string,
    ) => Promise<MetadataUpdateVerificationResult>,
    profileId,
    videoId,
    patch,
    operationId,
  );
