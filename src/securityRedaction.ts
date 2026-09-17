export function redactSensitive(value:unknown){
 let s=String(value??'');
 s=s.replace(/Bearer\s+[A-Za-z0-9._~+\/=\-]+/gi,'Bearer [REDACTED]');
 s=s.replace(/(access_token|refresh_token|client_secret|api_key|youtubeApiKey|openaiApiKey)\s*[:=]\s*["']?([^&\s"',}]+)/gi,'$1=[REDACTED]');
 s=s.replace(/AIza[0-9A-Za-z_-]{20,}/g,'AIza[REDACTED]');
 s=s.replace(/sk-[A-Za-z0-9_-]{16,}/g,'sk-[REDACTED]');
 return s
}
