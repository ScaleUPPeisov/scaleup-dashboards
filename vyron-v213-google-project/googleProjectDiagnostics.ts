import type {Channel,YoutubeProfile} from './types';
import type {GoogleConfigStatus,GoogleProjectDiagnosticSafe} from './api';
import {youtubeQuotaProjectIdentity} from './youtubeQuota';

export const GOOGLE_CLOUD_PROJECT_SELECTOR='https://console.cloud.google.com/projectselector2/apis/dashboard';
export function oauthProjectNumber(clientId:string){const m=clientId.trim().match(/^(\d+)-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/);return m?.[1]}
export function maskOAuthClientId(clientId:string){const id=clientId.trim(),m=id.match(/^(\d+)-(.+)(\.apps\.googleusercontent\.com)$/);if(!m)return id.length>18?`${id.slice(0,10)}••••${id.slice(-8)}`:id;return `${m[1]}-••••••••••${m[3]}`}
export function googleCloudConsoleUrl(projectId?:string|null){const p=String(projectId||'').trim();return p?`https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas?project=${encodeURIComponent(p)}`:GOOGLE_CLOUD_PROJECT_SELECTOR}
export function channelsSharingQuotaProject(channels:Channel[],profiles:YoutubeProfile[],config:GoogleConfigStatus|undefined,projectKey:string|null){if(!projectKey)return[];const byId=new Map(profiles.map(p=>[p.id,p]));return channels.filter(c=>{const p=c.youtubeProfileId?byId.get(c.youtubeProfileId):undefined;return youtubeQuotaProjectIdentity(p,config).projectKey===projectKey})}
export function localGoogleProjectDiagnosticPass(safe:GoogleProjectDiagnosticSafe|undefined,projectKey:string|null,upload:{resetAt?:string;limitSource?:string}|undefined){return Boolean(safe?.oauthProfileId&&safe.clientId&&projectKey&&upload?.resetAt&&upload?.limitSource&&safe.youtubeApiRequests===0&&safe.keychainSecretsRead===false)}
export function secretFieldNames(value:unknown){const found=new Set<string>();const walk=(x:unknown)=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x as Record<string,unknown>)){const n=k.toLowerCase();if(['client_secret','clientsecret','access_token','accesstoken','refresh_token','refreshtoken','authorization','api_key','apikey'].includes(n))found.add(k);walk(v)}};walk(value);return [...found]}
