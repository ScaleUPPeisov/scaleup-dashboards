// Fingerprints cached for a job must not be reused when its physical source path changes.
// This guard is deliberately side-effect free; the caller rehashes the new source.
export type SourceFingerprint=Readonly<{path:string;fingerprint:string;size:number;modifiedAt:number}>;
export function fingerprintForCurrentSource(cached:SourceFingerprint|undefined,currentPath:string|undefined,forceFresh=false):SourceFingerprint|undefined{
  // Just before an actual upload/recovery, do not trust size+mtime or a UI cache:
  // a file may have been rewritten at the same path with the same metadata.
  return !forceFresh&&cached&&currentPath&&cached.path===currentPath?cached:undefined;
}
